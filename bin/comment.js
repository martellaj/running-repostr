var Comment = (function () {
    function Comment(body, author, id) {
        this.body = body;
        this.author = author;
        this.id = id;
    }
    Comment.prototype.prepareForRepost = function () {
        var repost = '';
        var bodyParts = this.body.split('\n');
        for (var i = 0; i < bodyParts.length; i++) {
            if (bodyParts[i].trim() !== '') {
                repost += '>' + bodyParts[i] + '\n';
            }
        }
        repost += '\n*Originally asked by /u/' + this.author + ' in yesterday\'s Q&A thread.*\n***\n^(Please message /u/BBQLays with any questions or comments about this bot.)';
        return repost;
    };
    return Comment;
})();
module.exports = Comment;
//# sourceMappingURL=comment.js.map