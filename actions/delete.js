const {
    trackHandledEvent,
    getUserId,
} = require('../utils');
const db = require('../db');

async function deleteMe(ctx) {
    const userId = getUserId(ctx);
    await db.deleteUser(userId);
    const deleteText = `Your data has been deleted.`;
    ctx.replyWithMarkdown(deleteText);
    trackHandledEvent(ctx, 'user-delete');
}

module.exports = {
    deleteMe,
}