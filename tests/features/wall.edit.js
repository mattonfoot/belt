module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Wall:Edit', function() {

        describe('Triggering the wall editor', function() {
            var storedId;

            it('Displays a wall editor to capture walls new details', function(done) {
                application.pauseListenting();

                services
                    .createWall( { name: 'editable wall' } )
                    .then( onWallCreated )
                    .catch( done );

                function onWallCreated( wall ) {
                    storedId = wall.getId();

                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'walleditor:displayed', onWallEditorDisplayed);

                    queue.trigger( 'wall:edit', storedId );
                }

                function onWallEditorDisplayed( data ) {
                    should.exist( data );

                    var calls = queue.getCalls();

                    calls.length.should.be.equal( 2 );

                    calls[0].event.should.be.equal( 'wall:edit' );
                    calls[1].event.should.be.equal( 'walleditor:displayed' );

                    done();
                }
            });

        });

    });

};
