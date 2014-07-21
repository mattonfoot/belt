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
  , Region = require('./lib/models/region');

describe('Managing Regions', function() {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_region_management_test', opts);
    var events = new Events();
    var interface = new Interface();
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( events, commands, queries, interface );

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

        services
            .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
            .then(function( resource ) {
                wall = resource;

                return services.addBoard( { preventDefault: function(){}, target: { wall: wall.getId(), name: 'test board' } } );
            })
            .then(function( resource ) {
                board = resource;

                return services.addRegion( { preventDefault: function(){}, target: { board: board.getId(), label: 'test region', value: 'test value' } } );
            })
            .then(function( resource ) {
                region = resource;

                done();
            })
            .catch( done );
    });

    describe('adding regions', function() {

        it('adding a region to a board', function( done ) {
            services
                .addRegion( { preventDefault: function(){}, target: { board: board.getId(), label: 'test region', value: 'test value' } } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Region );

                    resource.getBoard().should.be.equal( board.getId() );

                    done();
                })
                .catch( done );
        });

    });

    describe('opening regions for editing', function() {

        it('retreiving all data for displaying a region editor', function( done ) {
            var storedId = region.getId(), storedLabel = region.getLabel(), storedValue = region.getValue();

            services
                .displayRegionEditor( { preventDefault: function(){}, target: { 'data-target': region.getId() } } )
                .then(function( response ) {
                    interface.calllist.length.should.be.equal( 1 );

                    interface.calllist[0].call.should.be.equal( 'displayRegionEditor' );

                    var data = interface.calllist[0].data;

                    data.id.should.be.equal( storedId );
                    data.label.should.be.equal( storedLabel );
                    data.value.should.be.equal( storedValue );

                    done();
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

            services
                .modifyRegion( { preventDefault: function(){}, target: update } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Region );

                    resource.getLabel().should.be.equal( 'test region modified' );

                    done();
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        interface.calllist = [];

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

        var removeWalls = belt.findMany( 'wall' )
            .then(function( resources ) {
                var promises = resources.map(function( resource ) {
                    return belt.delete( 'wall', resource.getId() );
                });

                return RSVP.all( promises );
            });

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

        var removeRegion = belt.delete( 'region', region.getId() );

        RSVP.all( [ removeWalls, removeBoards, removeRegion ] )
            .then(function() {
                done();
            })
            .catch( done );
    });

});
