var reddit = require('./reddit');
var scheduler = require('node-schedule');
var moment = require('moment');
console.log('>>> Setting up the schedule...');
scheduler.scheduleJob({ hour: 16, minute: 30 }, function () {
    console.log('>>> Starting job...');
    reddit.repostUnansweredQuestionsFromYesterday();
});
scheduler.scheduleJob({ minute: 0 }, function () {
    console.log('>>> The current time is ' + moment().format('h:mm:ss a') + '.');
});
//# sourceMappingURL=server.js.map