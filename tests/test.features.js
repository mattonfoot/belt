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

    for (var ev in this.events) {
        clearOnceEvents( this, ev );
    }

    function clearOnceEvents( _this, ev ) {
        var cleansed = [];

        _this.events[ev].forEach(function( react ) {
            if (!react.once) {
                cleansed.push( react );
            }
        });

        _this.events[ev] = cleansed;
    }
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
            queue.once( 'wallselector:displayed', onWallSelectorDisplayed);

            queue.trigger( 'wall:select' );

            function onWallSelectorDisplayed( walls ) {
                should.exist( walls );

                walls.length.should.be.equal( 0 );

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:select' );
                calls[1].event.should.be.equal( 'wallselector:displayed' );

                done();
            }
        });

    });

    describe('Triggering the wall creator', function() {

        it('Displays a wall creator to capture new wall details', function(done) {
            queue.once( 'wallcreator:displayed', onWallCreateDisplayed);

            queue.trigger( 'wall:new' );

            function onWallCreateDisplayed( data ) {
                should.not.exist( data );

                var calls = queue.getCalls();

                calls.length.should.be.equal( 2 );

                calls[0].event.should.be.equal( 'wall:new' );
                calls[1].event.should.be.equal( 'wallcreator:displayed' );

                done();
            }
        });

    });

    describe('Triggering the creation of a wall', function() {
        var storedName = 'display wall';

        it('Creates and displays the chosen wall', function( done ) {
            queue.once( 'wall:firsttime', onWallFirsttime);

            queue.trigger( 'wall:create', { name: storedName } );

            function onWallFirsttime( wall ) {
                should.exist( wall );

                wall.should.respondTo( 'getId' );
                wall.should.respondTo( 'getName' );
                wall.getName().should.be.equal( storedName );

                var calls = queue.getCalls();

                calls.length.should.be.above( 3 );

                calls[0].event.should.be.equal( 'wall:create' );
                calls[1].event.should.be.equal( 'wall:created' );
                calls[2].event.should.be.equal( 'wall:displayed' );
                calls[3].event.should.be.equal( 'wall:firsttime' );

                done();
            }
        });

    });

    describe('Triggering the wall selector when there are multiple walls in the database', function() {

        it('Displays a complete list of walls to select from', function(done) {
            application.pauseListenting();

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
                    application.startListening();

                    queue.once( 'wallselector:displayed', after);

                    queue.trigger( 'wall:select', {} );
                })
                .catch( done );

            function after( walls ) {
                should.exist( walls );

                walls.length.should.be.equal( 3 );

                walls.forEach(function( wall ) {
                    wall.should.respondTo( 'getId' );
                    wall.should.respondTo( 'getName' );
                });

                var calls = queue.getCalls();

                calls[0].event.should.be.equal( 'wall:select' );
                calls[1].event.should.be.equal( 'wallselector:displayed' );

                done();
            }
        });

    });

    describe('Triggering the selecting of a wall', function() {
        var storedId, storedName = 'display wall';

        it('Displays the chosen wall', function(done) {
            application.pauseListenting();

            services
                .createWall( { name: storedName } )
                .then(function( wall ) {
                    storedId = wall.getId();
                    wall.getName().should.be.equal( storedName );

                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'wall:firsttime', onWallFirsttime);

                    queue.trigger( 'wall:display', storedId );
                })
                .catch( done );

            function onWallFirsttime( wall ) {
                should.exist( wall );

                wall.should.respondTo( 'getId' );
                wall.getId().should.be.equal( storedId );
                wall.should.respondTo( 'getName' );
                wall.getName().should.be.equal( storedName );

                var calls = queue.getCalls();

                calls.length.should.be.above( 2 );

                calls[0].event.should.be.equal( 'wall:display' );
                calls[1].event.should.be.equal( 'wall:displayed' );
                calls[2].event.should.be.equal( 'wall:firsttime' );

                done();
            }
        });

    });

    afterEach(function (done) {
        if (debug) console.log( queue.getCalls() );

        var promises =[];

        [ 'region', 'card', 'pocket', 'board', 'wall' ]
            .forEach(function( schema ) {
                var promise = belt.findMany( schema )
                    .then(function( resources ) {
                        if (!resources.length) return;

                        var promises = resources.map(function( resource ) {
                            return new Promise(function(resolve, reject) {
                                belt.delete( schema, resource.getId() )
                                    .then(function() {
                                        resolve();
                                    })
                                    .catch( reject );
                            });
                        });

                        return RSVP.all( promises );
                    });

                promises.push( promise );
            });

        RSVP.all( promises )
            .then(function() {
                queue.clearCalls();
                application.startListening();

                done();
            })
            .catch( done );
    });

});
