const { Scenes: { BaseScene } } = require('telegraf');
const db = require("../db");
const zipcodes = require('zipcodes');
const config = require("../config");
const {
    getUserId,
    trackHandledEvent,
} = require('../utils');

const zipcodeScene = new BaseScene('ZIPCODE_SCENE_ID');

zipcodeScene.enter((ctx) => {
    ctx.reply('What\'s your preferred zipcode? e.g. 15213');
})

zipcodeScene.on('text', async (ctx) => {
    const userId = getUserId(ctx);
    let user = await db.getUser(userId);
    const inputZipcode = ctx.message.text;

    if (!inputZipcode) {
        trackHandledEvent(ctx, 'zipcode-update-invalid');
        ctx.replyWithMarkdown(`No zipcode provided. Start again with /zipcode`);
        return ctx.scene.leave();
    }
    const zipcode = escape(inputZipcode);
    const zipcodeInfo = zipcodes.lookup(zipcode);
    const isZipcodeValid = zipcodes.lookup(zipcode) && config.VALID_STATES.includes(zipcodeInfo.state);
    if (!isZipcodeValid) {
        trackHandledEvent(ctx, 'zipcode-update-invalid');
        ctx.replyWithMarkdown(`Invalid zipcode or your zipcode is not currently supported. Start again with /zipcode`);
        return ctx.scene.leave();
    }

    if (user) {
        await db.setZipcode(userId, zipcode);
    } else {
        await db.addSubscriber(userId, config.DEFAULT_RANGE_MI, zipcode, /* active= */false);
    }

    user = await db.getUser(userId);
    const reply = user.active ? `Zipcode set to ${zipcode}` : `Zipcode set to ${zipcode}.\n----------\nUse /subscribe to receive hourly updates.`

    ctx.replyWithMarkdown(reply);
    trackHandledEvent(ctx, 'zipcode-update-success');
    return ctx.scene.leave();
});

module.exports = {
    zipcodeScene,
};