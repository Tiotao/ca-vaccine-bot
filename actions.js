const { subscribeToUpdates, unsubscribeUpdates } = require("./actions/subscription");
const { sendHelp, sendHelpOnStart } = require("./actions/help");
const { sendWhatDoesTheBotSay } = require("./actions/about");
const { getStats } = require("./actions/stats");
const { deleteMe } = require("./actions/delete");
const { handleUnknownMessage } = require("./actions/unknown_message");
const { updateNow } = require("./actions/update_now");

module.exports = {
    subscribeToUpdates,
    unsubscribeUpdates,
    sendHelp,
    sendWhatDoesTheBotSay,
    getStats,
    deleteMe,
    handleUnknownMessage,
    updateNow,
    sendHelpOnStart,
}