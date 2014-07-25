module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Board:New', function() {

        describe('Triggering the board creator', function() {
            var storedId;

            it('Displays a board creator to capture new board details', function(done) {
                application.pauseListenting();

                services
                    .createWall( { name: 'wall for new board' } )
                    .then(function( wall ) {
                        storedId = wall.getId();

                        queue.clearCalls();
                        application.startListening();

                        queue.once( 'boardcreator:displayed', onDisplayed);

                        queue.trigger( 'board:new', storedId );
                    })
                    .catch( done );

                function onDisplayed( data ) {
                    should.not.exist( data );

                    var calls = queue.getCalls();

                    calls.length.should.be.equal( 2 );

                    calls[0].event.should.be.equal( 'board:new' );
                    calls[1].event.should.be.equal( 'boardcreator:displayed' );

                    done();
                }
            });

        });
    });

};
