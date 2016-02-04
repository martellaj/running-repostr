import Comment = require('./comment');
import config = require('./config');
import moment = require('moment-timezone');
import request = require('request');
import Q = require('q');

/**
 * Gets unanswered comments from the previous day's Q&A thread, processes them,
 * and reposts them into the current day's Q&A thread.
 * 
 * @name repostUnansweredQuestionsFromYesterday
 */
export function repostUnansweredQuestionsFromYesterday () {
  getUnansweredCommentsFromYesterday()
    .then(function (response: { comments: Comment[], token: string }) {
      let reposts: string[] = [];
      
      // Prepare the comments for reposting (quoting and disclaimer).
      for (let i = 0; i < response.comments.length; i++) {
        let repost = response.comments[i].prepareForRepost();
        reposts.push(repost);
      }
      
      repostUnansweredCommentsFromYesterday(reposts, response.token);
    });
}

/**
 * Gets unanswered comments from previous day's Q&A thread.
 * 
 * @name getUnansweredCommentsFromYesterday
 * @returns A promise with an array of unanswered comments.
 */
function getUnansweredCommentsFromYesterday () {
  let deferred = Q.defer();
  
  getAccessToken()
    .then(function (token: string) {
      console.log('>>> Received an access token from reddit API...');
      
      // Get yesterday's date.
      let yesterday = moment().subtract(1, 'day').tz('America/Los_Angeles');
      let yesterdayThreadTitle: string;
      
      // Get thread title based on the date.
      if (yesterday.day() === 2) {
        yesterdayThreadTitle = 'Super Moronic Monday -- Your Weekly Stupid Question Thread';
      } else {
        yesterdayThreadTitle = yesterday.format('MMMM DD, YYYY');
      }
      
      console.log('>>> Attempting to get yesterday\'s thread: ', yesterdayThreadTitle);
      
      // Attempt to find thread. Be wary of random 503s from reddit API.
      getThread(yesterdayThreadTitle, token)
        .then(function (threadId: string) {
          if (threadId === '404') {
            console.log('>>> No thread found for ' + yesterdayThreadTitle + '.');
            deferred.resolve({
              comments: [],
              token: token
            });
          } else {
            // Now that we have yesterday's thread ID, get the unanswered comments from it.
            getUnansweredComments(threadId, token)
              .then(function (comments: Comment[]) {
                console.log('>>> Got ' + comments.length + ' unanswered comments from yesterday\'s thread...');
                
                deferred.resolve({
                  comments: comments,
                  token: token  
                });
              }, function (statusCode: number) {
                // Sometimes reddit returns a random 503. Log it, but try again.
                if (statusCode === 503) {
                  console.error('>>> Hit a random 503 from the reddit API. Trying again...');
                  getUnansweredCommentsFromYesterday();
                }
              });
          }
        }, function (statusCode: number) {
          // Sometimes reddit returns a random 503. Log it, but try again.
          if (statusCode === 503) {
            console.error('>>> Hit a random 503 from the reddit API. Trying again...');
            getUnansweredCommentsFromYesterday();
          }
        });
    }, function (error) {
      console.log('>>> Unable to get access token.');
    });
    
  return deferred.promise;
}

/**
 * Reposts unanswered comments into the current day's Q&A thread.
 * 
 * @name repostUnansweredCommentsFromYesterday
 * @param comments An array of all comments to post.
 * @param token A reddit API access token.
 */
function repostUnansweredCommentsFromYesterday (comments: string[], token: string) {
  // Get today's date.
  let today = moment().tz('America/Los_Angeles');
  let todayThreadTitle: string;
  
  // Get thread title based on the date.
  if (today.day() === 2) {
    todayThreadTitle = 'Super Moronic Monday -- Your Weekly Stupid Question Thread';
  } else {
    todayThreadTitle = today.format('MMMM DD, YYYY');
  }
  
  console.log('>>> Trying to get today\'s thread: ', todayThreadTitle);
  
  // Attempt to find thread. Be wary of random 503s from reddit API.
  getThread(todayThreadTitle, token)
    .then(function (threadId: string) {
      for (let i = 0; i < comments.length; i++) {
        repostComment(comments[i], threadId, token);
      }
    }, function (statusCode: number) {
      // Sometimes reddit returns a random 503. Log it, but try again.
      if (statusCode === 503) {
        console.error('>>> Hit a random 503 from the reddit API. Trying again...');
        repostUnansweredCommentsFromYesterday(comments, token);
      }
    });
}

/**
 * Reposts a comment into the given thread.
 * 
 * @name repostComment
 * @param comment The comment to post.
 * @param threadID The ID of the target thread.
 * @param token A reddit API access token.
 */
function repostComment (comment: string, threadId: string, token: string) {
  var postCommentRequest = {
    url: 'https://oauth.reddit.com/api/comment?api_type=json&text=' + encodeURIComponent(comment) + '&thing_id=t3_' + threadId,
    headers: {
      'User-Agent': 'running-repostr/1.1 by /u/BBQLays',
      'Authorization': 'Bearer ' + token
    }
  };
  
  request.post(postCommentRequest, function (error, response, body) {
    body = JSON.parse(body);
    
    if (body.json.errors.length === 0) {
      console.log('>>> Successfully reposted a question.');
    } else {
      console.error('Error posting comment: ');
      console.error(body.json.errors);
    }
  });
}

/**
 * Gets a reddit API access token.
 * 
 * @name getAccessToken
 * @returns A promise with an access token.
 */
function getAccessToken () {
  let deferred = Q.defer();
  
  let tokenRequest = {
    url: 'https://www.reddit.com/api/v1/access_token',
    auth: {
      user: config.clientId,
      pass: config.clientSecret
    },
    form: {
      'grant_type': 'password',
      'username': config.username,
      'password': config.password
    },
    headers: {
      'User-Agent': 'running-repostr/1.0 by /u/BBQLays'
    }
  };

  request.post(tokenRequest, function (error, response, body) {
    if (error) {
      deferred.reject(error);
    } else {
      deferred.resolve(JSON.parse(body).access_token);
    }
  });
  
  return deferred.promise;
}

/**
 * Gets a thread from the reddit API.
 * 
 * @name getThread
 * @param title The target thread's search title.
 * @param token A reddit API access token.
 * @returns A promise with thread ID.
 */
function getThread (title: string, token: string) {
  let deferred = Q.defer();
  
  let threadRequest = {
    url: 'https://oauth.reddit.com/r/running/search?restrict_sr=true&limit=5&sort=relevance&t=week&q="' + title + '"',
    headers: {
      'User-Agent': 'running-repostr/1.0 by /u/BBQLays',
      'Authorization': 'Bearer ' + token
    }
  };
  
  request.get(threadRequest, function (error, response, body) {
    if (response.statusCode === 200) {
      body = JSON.parse(body);
      
      if (body.data.children[0]) {
        deferred.resolve(body.data.children[0].data.id);
      } else {
        deferred.resolve('404');
      }
    } else {
      deferred.reject(response.statusCode);
    }
  });
  
  return deferred.promise;
}

/**
 * Gets unanswered comments with no responses from the target thread.
 * 
 * @name getUnansweredComments
 * @param threadId The ID of the target thread.
 * @param token A reddit API access token.
 * @returns A promise with an array of unanswered comments.
 */
function getUnansweredComments (threadId: string, token: string) {
  let deferred = Q.defer();
  
  request.get('https://www.reddit.com/comments/' + threadId + '.json', function (error, response, body) {
    if (response.statusCode === 200) {
      body = JSON.parse(body);
      let comments = body[1].data.children;
      let unansweredComments: Comment[] = [];
      
      // Cycle through the comments and build an array of comments that went 
      // unanswered with the body, author, and ID.
      for (let i = 0; i < comments.length; i++) {
        
        // Handle "more" comments, unelegantly.
        // TODO: Use /api/morechildren to get more comments.
        // https://www.reddit.com/dev/api#GET_api_morechildren
        if (comments[i].kind === 'more') {
          let moreComments = comments[i].data;
          for (let j = 0; j < moreComments.length; j++) {
            if (moreComments[j].data.replies === '' && moreComments[j].data.score > 0 && moreComments[j].data.author !== 'running-repostr') {
              let comment: Comment = new Comment(moreComments[j].data.body, moreComments[j].data.author, moreComments[j].data.id);
              unansweredComments.push(comment);
            }
          }
        }
        
        // Save comment if it had no replies, had upvotes, and wasn't already
        // a repost by the bot.
        if (comments[i].data.replies === '' && comments[i].data.score > 0 && comments[i].data.author !== 'running-repostr') {
          let comment: Comment = new Comment(comments[i].data.body, comments[i].data.author, comments[i].data.id);
          unansweredComments.push(comment);
        }
      }
      
      // Return list of unanswered comments.
      deferred.resolve(unansweredComments);
    } else {
      deferred.reject(response.statusCode);
    }
  });
  
  return deferred.promise;
}