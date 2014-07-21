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
    var ids = {};
    var belt = new Belt( 'belt_wall_management_test', { db: require('memdown') });
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

        it('listing all walls for display in selector', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall one' } } )
                .then(function() {
                    return services.addWall( { preventDefault: function(){}, target: { name: 'test wall two' } } );
                })
                .then(function() {
                    return services.addWall( { preventDefault: function(){}, target: { name: 'test wall three' } } );
                })
                .then(function( wall ) {
                    return services.openWallSelector( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } );
                })
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
        var storedId;

        it('blank wall', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( wall ) {
                    storedId = wall.getId();

                    return services.displayWall( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } );
                })
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
        var storedId, storedName;

        it('retreiving all data for displaying a wall editor', function( done ) {
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( wall ) {
                    storedId = wall.getId();
                    storedName = wall.getName();

                    return services.displayWallEditor( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } );
                })
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
            services
                .addWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
                .then(function( resource ) {
                    return queries.getAllWalls();
                })
                .then(function( resources ) {
                    var update = resources[0];
                    update.name = 'test wall modified';

                    return services.modifyWall( { preventDefault: function(){}, target: update } );
                })
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

        queries.getAllWalls()
            .then(function( resources ) {
                var promises = resources.map(function( resource ) {
                    return belt.delete( 'wall', resource.getId() );
                });

                RSVP.all( promises )
                    .then(function () {
                        return queries.getAllWalls();
                    })
                    .then(function( resources ) {
                        done();
                    })
                    .catch( done );
            });
    });

});
