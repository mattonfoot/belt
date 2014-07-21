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
  , Pocket = require('./lib/models/pocket');

describe('Managing Boards', function() {
    var ids = {};
    var belt = new Belt( 'belt_board_management_test', { db: require('memdown') });
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

        belt.resource( 'board', Board.constructor )
            .schema( Board.schema )
            .validator( Board.validator )
            .beforeCreate( Board.onBeforeCreate )
            .beforeUpdate( Board.onBeforeUpdate );

        belt.resource( 'pocket', Pocket.constructor )
            .schema( Pocket.schema )
            .validator( Pocket.validator )
            .beforeCreate( Pocket.onBeforeCreate )
            .beforeUpdate( Pocket.onBeforeUpdate );
    });

    describe('adding boards', function() {

        it('adding a board to a wall', function( done ) {
            var wall;

            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( resource ) {
                    wall = resource;

                    return services.addBoard( { preventDefault: function(){}, target: { wall: wall.getId(), name: 'test board' } } );
                })
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Board );

                    resource.getWall().should.be.equal( wall.getId() );

                    done();
                })
                .catch( done );
        });

    });

    describe('opening boards for editing', function() {
        var storedId, storedName;

        it('retreiving all data for displaying a board editor', function( done ) {
            var wall;

            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( resource ) {
                    wall = resource;
                    return services.addBoard( { preventDefault: function(){}, target: { wall: wall.getId(), name: 'test board' } } );
                })
                .then(function( board ) {
                    storedId = board.getId();
                    storedName = board.getName();

                    return services.displayBoardEditor( { preventDefault: function(){}, target: { 'data-target': board.getId() } } );
                })
                .then(function( response ) {
                    interface.calllist.length.should.be.equal( 1 );

                    interface.calllist[0].call.should.be.equal( 'displayBoardEditor' );

                    var data = interface.calllist[0].data;

                    data.id.should.be.equal( storedId );
                    data.name.should.be.equal( storedName );

                    done();
                })
                .catch( done );
        });

    });

    describe('modifying board data', function() {

        it('updating one board', function( done ) {
            var wall;

            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( resource ) {
                    wall = resource;

                    return services.addBoard( { preventDefault: function(){}, target: { wall: wall.getId(), name: 'test board' } } );
                })
                .then(function( board ) {
                    return queries.getAllBoardsForWall( wall.getId() );
                })
                .then(function( resources ) {
                    var update = resources[0];
                    update.name = 'test board modified';
                    update.wall = update.getWall();

                    return services.modifyBoard( { preventDefault: function(){}, target: update } );
                })
                .then(function( resource ) {

                    should.exist( resource );

                    resource.should.be.instanceOf( Board );

                    resource.getName().should.be.equal( 'test board modified' );

                    done();
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        interface.calllist = [];

        queries.getAllWalls()
            .then(function( walls ) {
                var promises = [];

                walls.forEach(function( wall ) {
                    return queries
                        .getAllBoardsForWall( wall.getId() )
                        .then(function( boards ) {
                            boards.forEach(function( board ) {
                                promises.push( belt.delete( 'board', board.getId() ) );
                            });
                        })
                        .then(function() {
                            return queries.getAllPocketsForWall( wall.getId() );
                        })
                        .then(function( pockets ) {
                            pockets.forEach(function( pocket ) {
                                promises.push( belt.delete( 'pocket', pocket.getId() ) );
                            });
                        })
                        .then(function() {
                            promises.push( belt.delete( 'wall', wall.getId() ) );
                        });
                });

                return RSVP.all( promises );
            })
            .then(function( resources ) {
                done();
            })
            .catch( done );
    });

});
