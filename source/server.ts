import config = require('./config');
import reddit = require('./reddit');
import scheduler = require('node-schedule');
import moment = require('moment');

console.log('>>> Setting up the schedule...');

scheduler.scheduleJob({ hour: 14, minute: 0 }, function () {
  console.log('>>> Starting job...');
  reddit.repostUnansweredQuestionsFromYesterday();  
});

scheduler.scheduleJob({ minute: 0 }, function () {
  console.log('>>> The current time is ' + moment().format('h:mm:ss a') + '.');
})
