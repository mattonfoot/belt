var $ = require('jquery')
  , Queue = require('./queue')
  , Application = require('./application')
  , UI = require('./ui');

var queue = new Queue();
var Application = new Application( queue );
var ui = new UI( queue, $('[data-provides="ui"]') );
