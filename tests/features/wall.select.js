module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Wall:Select', function() {

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

    });

};
