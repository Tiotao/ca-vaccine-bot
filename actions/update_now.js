const {
    getUserId,
    filterAppointments,
    trackHandledEvent,
    fetchStateAppointments,
} = require('../utils');
const db = require('../db');
const zipcodes = require('zipcodes');
const config = require('../config');

async function updateNow(ctx) {
    trackHandledEvent(ctx, 'fetch-update-now');
    const userId = getUserId(ctx);
    const user = await db.getUser(userId);
    const zipcodeInfo = zipcodes.lookup(user.zipcode);
    const appointments = await fetchStateAppointments(zipcodeInfo.state);
    const results = filterAppointments(
        appointments,
        user ? parseInt(user.range) : config.DEFAULT_RANGE_MI,
        user ? user.zipcode : config.DEFAULT_ZIPCODE
    );

    ctx.replyWithMarkdown(results);
}

module.exports = {
    updateNow,
}