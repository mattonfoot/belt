var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
  , Events = require('./lib/events')
  , Interface = require('./lib/interface')
  , Services = require('./lib/services')
  , Wall = require('./lib/models/wall');

describe('Managing Walls', function() {
    var ids = {}
      , opts = {};

    if ( !process.browser ) {
        opts.db = require('memdown');
    }

    var belt = new Belt( 'belt_wall_management_test', opts);
    var events = new Events();
    var interface = new Interface();
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( events, commands, queries, interface );

    var wall;
    before(function (done) {
        belt.resource( 'wall', Wall.constructor )
            .schema( Wall.schema )
            .validator( Wall.validator )
            .beforeCreate( Wall.onBeforeCreate )
            .beforeUpdate( Wall.onBeforeUpdate );

        services.addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
            .then(function( resource ) {
                wall = resource;
            })
            .then(function() {
                done();
            })
            .catch( done );
    });

    describe('adding walls', function() {

        it('adding one wall', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Wall );

                    done();
                })
                .catch( done );
        });

    });

    describe('listing walls', function() {

        before(function (done) {
            var firstWall = services.addWall( { preventDefault: function(){}, target: { name: 'test wall three' } } );
            var secondWall = services.addWall( { preventDefault: function(){}, target: { name: 'test wall two' } } );

            RSVP.all( [ firstWall, secondWall ] )
                .then(function() {
                    done();
                })
                .catch( done );
        });

        it('listing all walls for display in selector', function( done ) {
            services
                .openWallSelector( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } )
                .then(function() {
                    interface.calllist.length.should.be.equal( 1 );
                    interface.calllist[0].call.should.be.equal( 'openWallSelector' );

                    var data = interface.calllist[0].data;

                    data.length.should.be.equal( 3 );

                    data.forEach(function( resource ) {
                        resource.should.be.instanceOf( Wall );
                    });

                    done();
                })
                .catch( done );
        });

    });

    describe('displaying walls', function() {

        it('blank wall', function( done ) {
            var storedId = wall.getId();

            services
                .displayWall( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } )
                .then(function() {
                    interface.calllist.length.should.be.equal( 2 );

                    interface.calllist[0].call.should.be.equal( 'buildWall' );
                    interface.calllist[0].data.id.should.be.equal( storedId );

                    interface.calllist[1].call.should.be.equal( 'displayWall' );
                    interface.calllist[1].data.id.should.be.equal( storedId );

                    done();
                })
                .catch( done );
        });

    });

    describe('opening walls for editing', function() {

        it('retreiving all data for displaying a wall editor', function( done ) {
            var storedId = wall.getId(), storedName = wall.getName();

            services
                .displayWallEditor( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } )
                .then(function( response ) {
                    interface.calllist.length.should.be.equal( 1 );

                    interface.calllist[0].call.should.be.equal( 'displayWallEditor' );

                    var data = interface.calllist[0].data;

                    data.id.should.be.equal( storedId );
                    data.name.should.be.equal( storedName );

                    done();
                })
                .catch( done );
        });

    });

    describe('modifying wall data', function() {

        it('updating one wall', function( done ) {
            var update = {
                id: wall.getId()
              , name: 'test wall modified'
            };

            services
                .modifyWall( { preventDefault: function(){}, target: update } )
                .then(function( resource ) {
                    should.exist( resource );

                    resource.should.be.instanceOf( Wall );

                    resource.getName().should.be.equal( 'test wall modified' );

                    done();
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        interface.calllist = [];

        belt.findMany( 'wall' )
            .then(function( resources ) {
                var promises = [];

                resources.forEach(function( resource ) {
                    if ( resource.getId() !== wall.getId() ) {
                        promises.push( belt.delete( 'wall', resource.getId() ) );
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
        belt.delete( 'wall', wall.getId() )
            .then(function() {
                done();
            })
            .catch( done );
    });

});
