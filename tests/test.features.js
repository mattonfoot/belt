var should = require('chai').should()
  , RSVP = require('rsvp')
  , Promise = RSVP.Promise
  , Queue = require('./lib/queue')
  , Application = require('./lib/application')
  , UI = require('./lib/interface');

Queue.prototype._emit = Queue.prototype.emit;
Queue.prototype.emit = function( ev, data ) {
    this._calls = this._calls || [];

    this._calls.push({ event: ev, data: data });

    this._emit( ev, data );
};

Queue.prototype.clearCalls = function() {
    this._calls = [];
};

Queue.prototype.getCalls = function() {
    return this._calls;
};

var $ = {
    find: function find() {
        return this;
    }

  , append: function append() {
        return this;
    }
};

var debug = false;

var queue = new Queue({ debug: debug });
var ui = new UI( queue );
var application = new Application( queue, ui, { debug: debug } );
var belt = application.belt;
var services = application.services;

/*

    Click svents: 'new', 'edit', 'select', 'display', 'unlink'
    Submit events: 'create', 'update'

*/

describe('Basic Features', function() {

    describe('Triggering the wall selector when there are no walls in the database', function() {

        it('Displays an empty list of walls', function( done ) {
            queue.once( 'wallselector:displayed', function( walls ) {
                should.exist( walls );

                walls.length.should.be.equal( 0 );

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:select' );
                calls[1].event.should.be.equal( 'wallselector:displayed' );

                done();
            });

            queue.trigger( 'wall:select', {} );
        });

    });

    describe('Triggering the wall creator', function() {

        it('Displays a wall creator to capture new wall details', function(done) {
            queue.once( 'wallcreator:displayed', function( data ) {
                should.not.exist( data );

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:new' );
                calls[1].event.should.be.equal( 'wallcreator:displayed' );

                done();
            });

            queue.trigger( 'wall:new', {} );
        });

    });

    describe('Triggering the creation of a wall', function() {
        var storedName = 'display wall';

        it('Creates the chosen wall', function(done) {
            queue.once( 'wall:created', function( wall ) {
                should.exist( wall );

                wall.should.respondTo( 'getId' );
                wall.should.respondTo( 'getName' );
                wall.getName().should.be.equal( storedName );

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:create' );
                calls[1].event.should.be.equal( 'wall:created' );

                done();
            });

            queue.trigger( 'wall:create', { name: storedName } );
        });

    });

    describe('Triggering the wall selector when there are multiple walls in the database', function() {

        it('Displays a complete list of walls to select from', function(done) {
            queue.once( 'wallselector:displayed', function( walls ) {
                should.exist( walls );

                walls.length.should.be.equal( 3 );

                walls.forEach(function( wall ) {
                    wall.should.respondTo( 'getId' );
                    wall.should.respondTo( 'getName' );
                });

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:select' );
                calls[1].event.should.be.equal( 'wallselector:displayed' );

                done();
            });

            services
                .createWall( { name: 'wall one' } )
                .then(function( wall ) {
                    return services.createWall( { name: 'wall two' } );
                })
                .then(function( wall ) {
                    return services.createWall( { name: 'wall three' } );
                })
                .then(function( wall ) {
                    queue.clearCalls();

                    queue.trigger( 'wall:select', {} );
                })
                .catch( done );
        });

    });

    describe('Triggering the selecting of a wall', function() {
        var storedId, storedName = 'display wall';

        it('Displays the chosen wall', function(done) {
            queue.once( 'wall:displayed', function( wall ) {
                should.exist( wall );

                wall.should.respondTo( 'getId' );
                wall.getId().should.be.equal( storedId );
                wall.should.respondTo( 'getName' );
                wall.getName().should.be.equal( storedName );

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:display' );
                calls[1].event.should.be.equal( 'wall:displayed' );

                done();
            });

            services
                .createWall( { name: storedName } )
                .then(function( wall ) {
                    storedId = wall.getId();
                    wall.getName().should.be.equal( storedName );

                    queue.clearCalls();

                    queue.trigger( 'wall:display', {} );
                })
                .catch( done );
        });

    });

    afterEach(function (done) {
        queue.clearCalls();

        var promises =[];

        [ 'region', 'card', 'pocket', 'board', 'wall' ]
            .forEach(function( schema ) {
                var promise = belt.findMany( schema )
                    .then(function( resources ) {
                        if (!resources.length) return;

                        var promises = resources.map(function( resource ) {
                            return belt.delete( schema, resource.getId() );
                        });

                        return RSVP.all( promises );
                    });

                promises.push( promise );
            });

        RSVP.all( promises )
            .then(function() {
                done();
            })
            .catch( done );
    });

});
