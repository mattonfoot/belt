var $ = require('jquery')
  , Queue = require('./queue')
  , Application = require('./application')
  , UI = require('./ui');

var $ = $ || function(){ console.log( 'jQuery not loaded.' ); };

var queue = new Queue({ debug: true });
var ui = new UI( queue, $('[data-provides="ui"]'), {}, $ );
var application = new Application( queue, ui, {} );

module.exports = queue;
