var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Queue = require('./lib/queue')
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
  , Interface = require('./lib/interface')
  , Services = require('./lib/services')
  , Wall = require('./lib/models/wall')
  , Board = require('./lib/models/board')
  , Region = require('./lib/models/region')
  , Pocket = require('./lib/models/pocket')
  , Card = require('./lib/models/card');

describe('using an adapter', function() {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_board_management_test', opts);
    var queue = new Queue();
    var interface = new Interface( queue );
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( interface, commands, queries );

    var wall, board;
    before(function (done) {
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

        belt.resource( 'region', Region.constructor )
            .schema( Region.schema )
            .validator( Region.validator )
            .beforeCreate( Region.onBeforeCreate )
            .beforeUpdate( Region.onBeforeUpdate );

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

        services
            .createWall( { name: 'test wall' } )
            .then(function( resource ) {
                wall = resource;

                return services.createBoard( { wall: wall.getId(), name: 'test board' } );
            })
            .then(function( resource ) {
                board = resource;

                done();
            })
            .catch( done );
    });

    describe('adding boards', function() {

        it('adding a board to a wall', function( done ) {
            var eventCalled = false;

            belt
                .on('board:created', function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Board );

                    resource.getWall().should.be.equal( wall.getId() );

                    eventCalled = true;
                });

            services
                .createBoard( { wall: wall.getId(), name: 'test board' } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Board );

                    resource.getWall().should.be.equal( wall.getId() );

                    eventCalled.should.be.equal( true );

                    done();
                })
                .catch( done );
        });

    });

    describe('opening boards for editing', function() {

        it('retreiving all data for displaying a board editor', function( done ) {
            var storedId = board.getId(), storedName = board.getName(), eventCalled = false;


            queue
                .on('boardeditor:displayed', function( board ) {
                    board.getId().should.be.equal( storedId );
                    board.getName().should.be.equal( storedName );

                    eventCalled = true;
                });

            services
                .editBoard( board.getId() )
                .then(function( board ) {
                    board.getId().should.be.equal( storedId );
                    board.getName().should.be.equal( storedName );

                    eventCalled.should.be.equal( true );

                    done();
                })
                .catch( done );
        });

    });

    describe('modifying board data', function() {

        it('updating one board', function( done ) {
            var eventCalled = false;

            var update = {
                id: board.getId()
              , name: 'test board modified'
              , wall: board.getWall()
            };

            belt
                .on('board:updated', function( board ) {
                    should.exist( board );

                    board.should.be.instanceOf( Board );

                    board.getName().should.be.equal( 'test board modified' );

                    eventCalled = true;
                });


            services
                .updateBoard( update )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Board );

                    resource.getName().should.be.equal( 'test board modified' );

                    eventCalled.should.equal( true );

                    done();
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        queue.clearAll();

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
