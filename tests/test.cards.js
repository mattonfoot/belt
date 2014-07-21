var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
  , Events = require('./lib/events')
  , Interface = require('./lib/interface')
  , Services = require('./lib/services')
  , Wall = require('./lib/models/wall')
  , Board = require('./lib/models/board')
  , Pocket = require('./lib/models/pocket')
  , Card = require('./lib/models/card');

describe('Managing Cards', function() {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_card_management_test', opts);
    var events = new Events();
    var interface = new Interface();
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( events, commands, queries, interface );

    before(function () {
        belt.resource( 'wall', Wall.constructor )
            .schema( Wall.schema )
            .validator( Wall.validator )
            .beforeCreate( Wall.onBeforeCreate )
            .beforeUpdate( Wall.onBeforeUpdate );

        belt.schema( 'board', Board.schema )
            .resource( Board.constructor )
            .validator( Board.validator )
            .beforeCreate( Board.onBeforeCreate )
            .beforeUpdate( Board.onBeforeUpdate );

        belt.resource( 'pocket', Pocket.constructor )
            .schema( Pocket.schema )
            .validator( Pocket.validator )
            .beforeCreate( Pocket.onBeforeCreate )
            .beforeUpdate( Pocket.onBeforeUpdate );

        belt.resource( 'card', Card.constructor )
            .schema( Card.schema )
            .validator( Card.validator )
            .beforeCreate( Card.onBeforeCreate )
            .beforeUpdate( Card.onBeforeUpdate );
    });

    describe('adding cards', function() {

        it('adding a card to a board', function( done ) {
            done();
        });

        it('adding a card to a wall with two boards', function( done ) {
            done();
        });

    });

    describe('opening card for editing', function() {
        var storedId, storedTitle;

        it('retreiving all data for displaying a card editor', function( done ) {
                    done();
        });

    });

    describe('modifying card data', function() {

        it('updating one card', function( done ) {
                    done();
        });

    });

    afterEach(function (done) {
        interface.calllist = [];

        queries.getAllWalls()
            .then(function( walls ) {
                var promises = [];

                walls.forEach(function( wall ) {
                    var promise = queries.getAllBoardsForWall( wall.getId() );

                    promise.then(function( boards ) {
                        var promises2 = [];

                        boards.forEach(function( board ) {
                            var promise2 = queries.getAllPocketsOnBoard( board.getId() );

                            promise2.then(function( pockets ) {
                                var promises3 = [];

                                pockets.forEach(function( pocket ) {
                                    promises3.push( belt.delete( 'pocket', pocket.getId() ) );
                                });

                                return RSVP.all( promises3 );
                            });

                            promise2.then(function() {
                                return belt.delete( 'board', board.getId() );
                            });

                            promises2.push( promise2 );
                        });

                        return RSVP.all( promises2 );
                    });

                    promise.then(function() {
                        return belt.delete( 'wall', wall.getId() );
                    });

                    promises.push( promise );
                });

                return RSVP.all( promises );
            })
            .then(function( resources ) {
                done();
            })
            .catch( done );
    });

});
