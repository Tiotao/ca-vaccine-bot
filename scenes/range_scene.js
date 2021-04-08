const { Scenes: { BaseScene } } = require('telegraf');
const db = require("../db");
const config = require("../config");
const {
    getUserId,
    trackHandledEvent,
} = require('../utils');

const rangeScene = new BaseScene('RANGE_SCENE_ID');

rangeScene.enter((ctx) => {
    ctx.reply('What\'s your preferred search range?');
})

rangeScene.on('text', async (ctx) => {
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const inputRange = parseInt(escape(ctx.message.text));

    if (!inputRange) {
        trackHandledEvent(ctx, 'update-range-invalid-range');
        ctx.replyWithMarkdown(`No range specified. Please enter range between 0 and 1999 miles. Start again with /range.`);
        return ctx.scene.leave();
    }

    const isInputRangeValid = inputRange > 0 && inputRange < 1999;
    if (!isInputRangeValid) {
        trackHandledEvent(ctx, 'update-range-invalid-range');
        ctx.replyWithMarkdown(`You entered an invalid range. Please enter range between 0 and 1999 miles. Start again with /range.`);
        return ctx.scene.leave();
    }

    const range = isInputRangeValid ? inputRange : config.DEFAULT_RANGE_MI;

    if (user) {
        await db.setRange(userId, range);
    } else {
        await db.addSubscriber(userId, range);
    }

    const reply = user.active ? `Range set to ${range} mi` : `Range set to ${range} mi.\n----------\nUse /subscribe to receive hourly updates.`;

    ctx.replyWithMarkdown(reply);
    trackHandledEvent(ctx, 'update-range-success');
    return ctx.scene.leave();
});

module.exports = {
    rangeScene,
};