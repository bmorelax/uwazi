/** @format */
/* eslint-disable no-await-in-loop, no-console, camelcase */

import { tcServer, useThesaurusNames } from 'api/config/topicclassification';
import entities from 'api/entities';
import { QueryForEach, WithId } from 'api/odm';
import templates from 'api/templates';
import thesauri from 'api/thesauris';
import { extractSequence } from 'api/topicclassification/common';
import connect, { disconnect } from 'api/utils/connect_to_mongo';
import { buildModelName } from 'shared/commonTopicClassification';
import JSONRequest from 'shared/JSONRequest';
import { ensure, sleep } from 'shared/tsUtils';
import yargs from 'yargs';
import { MetadataObject } from '../app/api/entities/entitiesModel';
import { EntitySchema } from '../app/api/entities/entityType';
import { ThesaurusSchema } from '../app/api/thesauris/dictionariesType';

const { limit, recompute, overwrite, mode } = yargs
  .option('limit', { default: 1000000 })
  .option('recompute', {
    default: false,
    usage: 'If true, force topic-classification to refresh all predictions. Can be slow.',
  })
  .option('overwrite', {
    default: false,
    usage:
      'If true, replace suggestedMetadata in Uwazi with predictions, even if ' +
      'suggestions exist. This potentially recreates previously-rejected suggestions.',
  })
  .option('mode', {
    default: 'onlynew',
    usage:
      'onlynew: only process entities that have no value for the thesaurus; ' +
      'all: process all entities',
  })
  .help().argv;

type ClassificationSampleRequest = {
  refresh_predictions: boolean;
  samples: {
    seq: string;
    sharedId: string | undefined;
    training_labels: {
      topic: string;
    }[];
  }[];
};

type ClassificationSampleResponse = {
  json: { samples: { seq: string; predicted_labels: { topic: string; quality: number }[] }[] };
  status: any;
};

async function sendSample(
  path: string,
  request: ClassificationSampleRequest
): Promise<ClassificationSampleResponse | null> {
  let response: ClassificationSampleResponse = { json: { samples: [] }, status: 0 };
  let lastErr;
  for (let i = 0; i < 10; i += 1) {
    lastErr = undefined;
    try {
      response = await JSONRequest.put(path, request);
      if (response.status === 200) {
        break;
      }
    } catch (err) {
      lastErr = err;
    }
    console.error(`Attempt ${i} failed: ${response.status} ${lastErr}`);
    await sleep(523);
  }
  if (lastErr) {
    throw lastErr;
  }
  if (response.status !== 200) {
    console.error(response);
    return null;
  }
  return response;
}

async function handleResponse(
  e: WithId<EntitySchema>,
  prop: string,
  response: ClassificationSampleResponse,
  thesaurus: ThesaurusSchema
) {
  if (!e.suggestedMetadata) {
    e.suggestedMetadata = {};
  }
  if (!e.suggestedMetadata[prop] || overwrite) {
    const newPropMetadata = response.json.samples[0].predicted_labels.reduce(
      (res: MetadataObject<string>[], pred) => {
        const thesValue = (thesaurus.values || []).find(v => v.label === pred.topic);
        if (!thesValue || !thesValue.id) {
          console.error(
            `Model prediction "${pred.topic}" not found in thesaurus ${thesaurus.name}`
          );
          return res;
        }
        return [
          ...res,
          { value: thesValue.id, label: pred.topic, suggestion_confidence: pred.quality },
        ];
      },
      []
    );
    // JSON.stringify provides an easy and fast deep-equal comparison.
    if (JSON.stringify(newPropMetadata) !== JSON.stringify(e.suggestedMetadata[prop])) {
      e.suggestedMetadata[prop] = newPropMetadata;
      await entities.save(e, { user: 'sync-topic-classification', language: e.language });
      console.info(`Saved ${e.sharedId}`);
    }
  }
}

async function syncEntity(
  e: WithId<EntitySchema>,
  prop: string,
  model: string,
  thesaurus: ThesaurusSchema
) {
  if (!e.template || !e.metadata || e.language !== 'en' || !prop) {
    return false;
  }
  if (mode === 'onlynew') {
    if (e.metadata[prop] && e.metadata[prop]!.length) {
      return false;
    }
  }
  const sequence = await extractSequence(e);
  if (!sequence) {
    return false;
  }
  const request = {
    refresh_predictions: recompute,
    samples: [
      {
        seq: sequence,
        sharedId: e.sharedId,
        training_labels: (e.metadata[prop] || []).map(mo => ({
          topic: ensure<string>(useThesaurusNames ? mo.label : mo.value),
        })),
      },
    ],
  };
  const response = await sendSample(`${tcServer}/classification_sample?model=${model}`, request);
  if (!response) {
    return false;
  }
  if (
    !response.json.samples ||
    !response.json.samples.length ||
    response.json.samples[0].seq !== sequence
  ) {
    return false;
  }
  await handleResponse(e, prop, response, thesaurus);
  return true;
}

connect().then(
  async () => {
    try {
      if (!process.env.DATABASE_NAME) {
        throw new Error('You need to set $DATABASE_NAME!');
      }
      const allThesauri: WithId<ThesaurusSchema>[] = await thesauri.get();
      const allTemplates = await templates.get();
      await allThesauri
        .filter(t => t.enable_classification)
        .reduce(async (prom, selectedThesaurus) => {
          await prom;
          const templateAndProp = allTemplates.reduce((res: { [k: string]: string }, t) => {
            if (!t.properties) {
              return res;
            }
            const thesProp = t.properties.find(
              (p: any) => p.content === selectedThesaurus._id.toString()
            );
            if (!thesProp) {
              return res;
            }
            return {
              ...res,
              [t._id.toString()]: thesProp.name,
            };
          }, {});

          const modelName = buildModelName(selectedThesaurus.name);

          let index = 0;
          await QueryForEach(
            entities
              .get({ language: 'en' })
              .sort('-_id')
              .limit(limit),
            300,
            async (e: WithId<EntitySchema>) => {
              const didSomething = await syncEntity(
                e,
                templateAndProp[(e.template || '').toString()],
                modelName,
                selectedThesaurus
              );
              if (didSomething) {
                index += 1;
                if (index % 100 === 0) {
                  process.stdout.write(
                    `${selectedThesaurus.name}: syncronized entities -> ${index}\r`
                  );
                }
              }
            }
          );
          process.stdout.write(`${selectedThesaurus.name}: syncronized entities -> ${index}\n`);
        }, Promise.resolve());
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
    return disconnect();
  },
  () => {}
);
