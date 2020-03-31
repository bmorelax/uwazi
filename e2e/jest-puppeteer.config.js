module.exports = {
	launch: {
		dumpio: true,
		headless: false,
		slowMo: 2,
		devtools: false,
		args: ['--disable-infobars', '--disable-gpu', '--window-size=1300,800'],
	},
	browserContext: 'default'
};