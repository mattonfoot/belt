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

    var belt = new Belt( 'belt_region_management_test', opts);
    var queue = new Queue();
    var interface = new Interface( queue );
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( interface, commands, queries );

    var wall, board, region;
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

                return services.createRegion( { board: board.getId(), label: 'test region', value: 'test value' } );
            })
            .then(function( resource ) {

                region = resource;

                done();
            })
            .catch( done );
    });

    describe('adding regions', function() {

        it('adding a region to a board', function( done ) {

            belt
                .on('region:created', function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Region );

                    resource.getBoard().should.be.equal( board.getId() );

                    done();
                });

            services
                .createRegion( { board: board.getId(), label: 'test region', value: 'test value' } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Region );

                    resource.getBoard().should.be.equal( board.getId() );
                })
                .catch( done );
        });

    });

    describe('opening regions for editing', function() {

        it('retreiving all data for displaying a region editor', function( done ) {
            var storedId = region.getId(), storedLabel = region.getLabel(), storedValue = region.getValue();

            queue
                .on('regioneditor:displayed', function( region ) {

                    region.getId().should.be.equal( storedId );
                    region.getLabel().should.be.equal( storedLabel );
                    region.getValue().should.be.equal( storedValue );

                    done();
                });

            services
                .editRegion( region.getId() )
                .then(function( data ) {
                    data.getId().should.be.equal( storedId );
                    data.getLabel().should.be.equal( storedLabel );
                    data.getValue().should.be.equal( storedValue );
                })
                .catch( done );
        });

    });

    describe('modifying region data', function() {

        it('updating one region', function( done ) {
            var update = {
                id: region.getId()
              , label: 'test region modified'
              , board: region.getBoard()
            };

            belt
                .on('region:updated', function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Region );

                    resource.getLabel().should.be.equal( 'test region modified' );

                    done();
                });

            services
                .updateRegion( update )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Region );

                    resource.getLabel().should.be.equal( 'test region modified' );
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        queue.clearAll();

        belt.findMany( 'region' )
            .then(function( resources ) {
                var promises = [];

                resources.forEach(function( resource ) {
                    if ( resource.getId() !== region.getId() ) {
                        promises.push( belt.delete( 'region', resource.getId() ) );
                    }
                });

                return RSVP.all( promises );
            })
            .then(function() {
                done();
            })
            .catch( done );
    });

    after(function (done) {

        var promises = [];

        var removeWalls = belt.findMany( 'wall' )
            .then(function( resources ) {
                if (!resources.length) return;

                var promises = resources.map(function( resource ) {
                    return belt.delete( 'wall', resource.getId() );
                });

                return RSVP.all( promises );
            });
        promises.push( removeWalls );

        var removeBoards = belt.findMany( 'board' )
            .then(function( resources ) {
                if (!resources.length) return;

                var promises = [];

                resources.forEach(function( resource ) {
                    if ( resource.getId() !== board.getId() ) {
                        promises.push( belt.delete( 'board', resource.getId() ) );
                    }
                });

                return RSVP.all( promises );
            });
        promises.push( removeBoards );

        if (region) {
            var removeRegion = belt.delete( 'region', region.getId() );

            promises.push( removeRegion );
        }

        RSVP.all( promises )
            .then(function() {
                done();
            })
            .catch( done );
    });

});
