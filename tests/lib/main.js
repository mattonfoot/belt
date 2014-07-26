var $ = require('jquery')
  , Queue = require('./queue')
  , Application = require('./application')
  , Interface = require('./interface')
  , UI = require('./ui');

var $ = $ || function(){ console.log( 'jQuery not loaded.' ); };

var queue = new Queue({ debug: true });
var ui = new UI( queue, $('[data-provides="ui"]'), {}, $ );
var interface = new Interface( queue, ui );
var application = new Application( queue, interface, {} );

module.exports = queue;
