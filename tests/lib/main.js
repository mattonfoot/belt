var $ = require('jquery-browserify')
  , Queue = require('./queue')
  , Application = require('./application')
  , UI = require('./ui');

var queue = new Queue();
var application = new Application( queue );
var ui = new UI( queue, $('[data-provides="ui"]') );

module.exports = queue;
