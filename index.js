const { Telegraf, session, Scenes } = require("telegraf");
const config = require("./config");
const cron = require("node-cron");
const express = require('express');
const expressApp = express();
const TelegrafChatbase = require('telegraf-chatbase');
const { broadcastUpdate } = require('./utils');
const actions = require('./actions');
const scenes = require('./scenes');

const bot = new Telegraf(config.BOT_KEY);
const chatbase = new TelegrafChatbase.default({
    token: config.CHATBASE_TOKEN,
});
const stage = new Scenes.Stage([scenes.zipcodeScene, scenes.rangeScene]);

bot.use(chatbase.middleware());
bot.use(session());
bot.use(stage.middleware());

bot.start(actions.sendHelpOnStart);
bot.command("subscribe", actions.subscribeToUpdates);
bot.command("unsubscribe", actions.unsubscribeUpdates);
bot.command("range", ctx => ctx.scene.enter('RANGE_SCENE_ID'));
bot.command("zipcode", ctx => ctx.scene.enter('ZIPCODE_SCENE_ID'));
bot.command("now", actions.updateNow);
bot.command("help", actions.sendHelp);
bot.command("stats", actions.getStats);
bot.command("deleteme", actions.deleteMe);
bot.command("whatdoesthebotsay", actions.sendWhatDoesTheBotSay);
bot.on('message', actions.handleUnknownMessage);

if (config.ENV === "prod") {
    bot.telegram.setWebhook(config.WEBHOOK_URL);
    expressApp.use(bot.webhookCallback(`/${config.BOT_KEY}_webhook`));
    expressApp.get('/', (req, res) => {
        res.send('Hello World!');
    });
    expressApp.listen(config.WEBHOOK_PORT, () => {
        console.log(`Server running on port ${config.WEBHOOK_PORT}`);
    });
    cron.schedule(config.FETCH_FREQUENCY, async () => { await broadcastUpdate(bot); });
} else {
    bot.launch();
    broadcastUpdate(bot);
    cron.schedule(config.FETCH_FREQUENCY_DEBUG, async () => { await broadcastUpdate(bot); });
}


