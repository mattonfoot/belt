var Belt = require('../lib/adapter')

//  models
  , Board = require('./lib/models/board')
  , Card = require('./lib/models/card')
  , Pocket = require('./lib/models/pocket')
  , Region = require('./lib/models/region')
  , Wall = require('./lib/models/wall')

//  system
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
  , Interface = require('./lib/interface')
  , Services = require('./lib/services');

function Application( queue, options ) {
    this.options = options || {};
    if ( !process.browser ) {
        this.options.db = require('memdown');
    }

    var belt = this.belt = new Belt( 'vuu_se', this.options );

    // initialize the services
    var services = this.services = new Services( new Interface( queue ), new Commands( belt ), new Queries( belt ) );

    var factories = {
        "Board": Board
      , "Card": Card
      , "Pocket": Pocket
      , "Region": Region
      , "Wall": Wall
    };

    var listeners = [ 'created', 'updated', 'deleted' ];

    for ( var key in factories ) {
        var type = key.toLowerCase(), Model = factories[ key ];

        // register model
        belt.resource( type, Model.constructor )
            .schema( Model.schema )
            .validator( Model.validator )
            .beforeCreate( Model.onBeforeCreate )
            .beforeUpdate( Model.onBeforeUpdate );

        // listen to db for events
        attachListenersToDb( type );
    }


    function attachListenersToDb( type  ) {
        listeners.each(function( listener ) {
            belt.on( type + ':' + listener, function( data ) {
                queue.trigger( type + ':' + listener, data );
            });
        });
    }

    this.constructor = Application;

    // setup events to trigger services

    var listeners2 = [ 'new', 'create', 'edit', 'update', 'select', 'display', 'unlink', 'move', 'resize' ];

    for ( var x in factories ) {
        setUpEventListeners( x );
    }

    function setUpEventListeners( type ) {
        listeners2.forEach(function( task ) {
            queue.on( type + ':' + listeners, function( ev ) {
                services[ task + type ]( ev );
            });
        });
    }

    queue
        .on('board:displayed', function( board ) {
            services.displayCards( board );
            services.displayRegions( board );
        })

        .on('wall:firsttime', function( wall ) {
            services.newBoard();
        })

        ;
}

module.exports = Application;
