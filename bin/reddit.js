var Comment = require('./comment');
var config = require('./config');
var moment = require('moment-timezone');
var request = require('request');
var Q = require('q');
function repostUnansweredQuestionsFromYesterday() {
    getUnansweredCommentsFromYesterday()
        .then(function (response) {
        var reposts = [];
        for (var i = 0; i < response.comments.length; i++) {
            var repost = response.comments[i].prepareForRepost();
            reposts.push(repost);
        }
        repostUnansweredCommentsFromYesterday(reposts, response.token);
    });
}
exports.repostUnansweredQuestionsFromYesterday = repostUnansweredQuestionsFromYesterday;
function getUnansweredCommentsFromYesterday() {
    var deferred = Q.defer();
    getAccessToken()
        .then(function (token) {
        console.log('>>> Received an access token from reddit API...');
        var yesterday = moment().subtract(1, 'day').tz('America/Los_Angeles');
        var yesterdayThreadTitle;
        if (yesterday.day() === 2) {
            yesterdayThreadTitle = 'Super Moronic Monday -- Your Weekly Stupid Question Thread';
        }
        else {
            yesterdayThreadTitle = yesterday.format('MMMM DD, YYYY');
        }
        console.log('>>> Attempting to get yesterday\'s thread: ', yesterdayThreadTitle);
        getThread(yesterdayThreadTitle, token)
            .then(function (threadId) {
            if (threadId === '404') {
                console.log('>>> No thread found for ' + yesterdayThreadTitle + '.');
                deferred.resolve({
                    comments: [],
                    token: token
                });
            }
            else {
                getUnansweredComments(threadId, token)
                    .then(function (comments) {
                    console.log('>>> Got ' + comments.length + ' unanswered comments from yesterday\'s thread...');
                    deferred.resolve({
                        comments: comments,
                        token: token
                    });
                }, function (statusCode) {
                    if (statusCode === 503) {
                        console.error('>>> Hit a random 503 from the reddit API. Trying again...');
                        getUnansweredCommentsFromYesterday();
                    }
                });
            }
        }, function (statusCode) {
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
function repostUnansweredCommentsFromYesterday(comments, token) {
    var today = moment().tz('America/Los_Angeles');
    var todayThreadTitle;
    if (today.day() === 2) {
        todayThreadTitle = 'Super Moronic Monday -- Your Weekly Stupid Question Thread';
    }
    else {
        todayThreadTitle = today.format('MMMM DD, YYYY');
    }
    console.log('>>> Trying to get today\'s thread: ', todayThreadTitle);
    getThread(todayThreadTitle, token)
        .then(function (threadId) {
        for (var i = 0; i < comments.length; i++) {
            repostComment(comments[i], threadId, token);
        }
    }, function (statusCode) {
        if (statusCode === 503) {
            console.error('>>> Hit a random 503 from the reddit API. Trying again...');
            repostUnansweredCommentsFromYesterday(comments, token);
        }
    });
}
function repostComment(comment, threadId, token) {
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
        }
        else {
            console.error('Error posting comment: ');
            console.error(body.json.errors);
        }
    });
}
function getAccessToken() {
    var deferred = Q.defer();
    var tokenRequest = {
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
        }
        else {
            deferred.resolve(JSON.parse(body).access_token);
        }
    });
    return deferred.promise;
}
function getThread(title, token) {
    var deferred = Q.defer();
    var threadRequest = {
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
            }
            else {
                deferred.resolve('404');
            }
        }
        else {
            deferred.reject(response.statusCode);
        }
    });
    return deferred.promise;
}
function getUnansweredComments(threadId, token) {
    var deferred = Q.defer();
    request.get('https://www.reddit.com/comments/' + threadId + '.json', function (error, response, body) {
        if (response.statusCode === 200) {
            body = JSON.parse(body);
            var comments = body[1].data.children;
            var unansweredComments = [];
            for (var i = 0; i < comments.length; i++) {
                if (comments[i].kind === 'more') {
                    var moreComments = comments[i].data;
                    for (var j = 0; j < moreComments.length; j++) {
                        if (moreComments[j].data.replies === '' && moreComments[j].data.score > 0 && moreComments[j].data.author !== 'running-repostr') {
                            var comment = new Comment(moreComments[j].data.body, moreComments[j].data.author, moreComments[j].data.id);
                            unansweredComments.push(comment);
                        }
                    }
                }
                if (comments[i].data.replies === '' && comments[i].data.score > 0 && comments[i].data.author !== 'running-repostr') {
                    var comment = new Comment(comments[i].data.body, comments[i].data.author, comments[i].data.id);
                    unansweredComments.push(comment);
                }
            }
            deferred.resolve(unansweredComments);
        }
        else {
            deferred.reject(response.statusCode);
        }
    });
    return deferred.promise;
}
//# sourceMappingURL=reddit.js.map