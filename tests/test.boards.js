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
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_board_management_test', opts);
    var events = new Events();
    var interface = new Interface();
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( events, commands, queries, interface );

    var wall, board;
    before(function (done) {
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

        services
            .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
            .then(function( resource ) {
                wall = resource;

                return services.addBoard( { preventDefault: function(){}, target: { wall: wall.getId(), name: 'test board' } } );
            })
            .then(function( resource ) {
                board = resource;

                done();
            })
            .catch( done );
    });

    describe('adding boards', function() {

        it('adding a board to a wall', function( done ) {
            services
                .addBoard( { preventDefault: function(){}, target: { wall: wall.getId(), name: 'test board' } } )
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

        it('retreiving all data for displaying a board editor', function( done ) {
            var storedId = board.getId(), storedName = board.getName();

            services
                .displayBoardEditor( { preventDefault: function(){}, target: { 'data-target': board.getId() } } )
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
            var update = {
                id: board.getId()
              , name: 'test board modified'
              , wall: board.getWall()
            };

            services
                .modifyBoard( { preventDefault: function(){}, target: update } )
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

        var removeBoards = belt.findMany( 'board' )
            .then(function( resources ) {
                var promises = [];

                resources.forEach(function( resource ) {
                    if ( resource.getId() !== board.getId() ) {
                        promises.push( belt.delete( 'board', resource.getId() ) );
                    }
                });

                return RSVP.all( promises );
            });

        var removePockets = belt.findMany( 'pocket' )
            .then(function( resources ) {
                var promises = resources.map(function( resource ) {
                    return belt.delete( 'pocket', resource.getId() );
                });

                return RSVP.all( promises );
            });

        RSVP.all( [ removeBoards, removePockets ] )
            .then(function() {
                done();
            })
            .catch( done );
    });

    after(function (done) {
        belt.findMany( 'wall' )
            .then(function( walls ) {
                var promises = walls.map(function( wall ) {
                    return belt.delete( 'wall', wall.getId() );
                });

                return RSVP.all( promises );
            })
            .then(function() {
                return belt.delete( 'board', board.getId() );
            })
            .then(function() {
                done();
            })
            .catch( done );
    });

});
