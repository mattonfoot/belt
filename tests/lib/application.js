var Belt = require('../../lib/adapter')

//  models
  , Board = require('../lib/models/board')
  , Card = require('../lib/models/card')
  , Pocket = require('../lib/models/pocket')
  , Region = require('../lib/models/region')
  , Wall = require('../lib/models/wall')

//  system
  , Commands = require('../lib/commands')
  , Queries = require('../lib/queries')
  , Services = require('../lib/services');

function Application( queue, ui, options ) {
    this.options = options || {};
    if ( !process.browser ) {
        this.options.db = require('memdown');
    }

    var belt = this.belt = new Belt( 'vuu_se', this.options );

    // initialize the services
    var services = this.services = new Services( ui, new Commands( belt ), new Queries( belt ) );

    this._listen = true;

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
        listeners.forEach(function( listener ) {
            belt.on( type + ':' + listener, function( data ) {
                queue.trigger( type + ':' + listener, data );
            });
        });
    }

    this.constructor = Application;

    var _this = this;

    // setup events to trigger services

    var listeners2 = [ 'new', 'create', 'edit', 'update', 'select', 'display', 'unlink', 'move', 'resize' ];

    for ( var x in factories ) {
        setUpEventListeners( x );
    }

    function setUpEventListeners( type ) {
        listeners2.forEach(function( task ) {
            queue.on( type.toLowerCase() + ':' + task, function( ev ) {
                if (!_this._listen || !services[ task + type ]) return;

                if (options.debug) {
                    console.log( 'services.' + task + type + '()' );
                }

                services[ task + type ]( ev );
            });
        });
    }

    queue
        .on('board:displayed', function( board ) {
            if (!_this._listen) return;

            services.displayCards( board );
            services.displayRegions( board );
        })

        .on('wall:firsttime', function( wall ) {
            if (!_this._listen) return;

            services.newBoard();
        })

        .on('wall:created', function( wall ) {
            if (!_this._listen) return;

            services.displayWall( wall.getId() );
        })

        .on('board:created', function( board ) {
            if (!_this._listen) return;

            services.displayBoard( board.getId() );
        })

        .on('region:created', function( region ) {
            if (!_this._listen) return;

            services.displayRegion( region.getId() );
        })

        .on('card:created', function( card ) {
            if (!_this._listen) return;

            services.displayCard( card.getId() );
        })

        ;
}

Application.prototype.pauseListenting = function() {
    this._listen = false;
};

Application.prototype.startListening = function() {
    this._listen = true;
};

module.exports = Application;
