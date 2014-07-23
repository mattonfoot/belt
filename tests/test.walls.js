var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Belt = require('../lib/adapter')
  , Queue = require('./lib/queue')
  , Commands = require('./lib/commands')
  , Queries = require('./lib/queries')
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
    var queue = new Queue();
    var interface = new Interface( queue );
    var commands = new Commands( belt );
    var queries = new Queries( belt );

    var services = new Services( interface, commands, queries );

    var wall;
    before(function (done) {
        belt.resource( 'wall', Wall.constructor )
            .schema( Wall.schema )
            .validator( Wall.validator )
            .beforeCreate( Wall.onBeforeCreate )
            .beforeUpdate( Wall.onBeforeUpdate );

        services.createWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
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
                .createWall( { preventDefault: function(){}, target: { name: 'test wall' } } )
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
            var firstWall = services.createWall( { preventDefault: function(){}, target: { name: 'test wall three' } } );
            var secondWall = services.createWall( { preventDefault: function(){}, target: { name: 'test wall two' } } );

            RSVP.all( [ firstWall, secondWall ] )
                .then(function() {
                    done();
                })
                .catch( done );
        });

        it('listing all walls for display in selector', function( done ) {

            queue
                .on( 'wallselector:display', function( walls ) {
                    walls.forEach(function( resource ) {
                        resource.should.be.instanceOf( Wall );
                    });

                    done();
                });

            services
                .selectWall( { preventDefault: function(){} } )
                .catch( done );
        });

    });

    describe('displaying walls', function() {

        it('blank wall', function( done ) {
            var storedId = wall.getId(), storedName = wall.getName(), displayCalled = false;

            queue
                .on( 'wall:display', function( wall ) {
                    displayCalled.should.not.be.equal( true );
                    displayCalled = true;

                    wall.getId().should.be.equal( storedId );
                    wall.getName().should.be.equal( storedName );
                });

            queue
                .on( 'wall:firsttime', function( wall ) {
                    displayCalled.should.be.equal( true );

                    wall.getId().should.be.equal( storedId );
                    wall.getName().should.be.equal( storedName );

                    done();
                });

            services
                .displayWall( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } )
                .catch( done );
        });

    });

    describe('opening walls for editing', function() {

        it('retreiving all data for displaying a wall editor', function( done ) {
            var storedId = wall.getId(), storedName = wall.getName();

            queue
                .on( 'wallselector:display', function( walls ) {
                    walls.length.should.be.equal( 1 );

                    var wall = walls[0];

                    wall.getId().should.be.equal( storedId );
                    wall.getName().should.be.equal( storedName );

                    done();
                });

            services
                .selectWall( { preventDefault: function(){}, target: { 'data-target': wall.getId() } } )
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
                .updateWall( { preventDefault: function(){}, target: update } )
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
        queue.clearAll();

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
