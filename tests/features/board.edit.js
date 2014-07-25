module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Board:Edit', function() {

        describe('Triggering the board editor', function() {
            var storedId, storedParentId;

            it('Displays a board editor to capture boards new details', function(done) {
                application.pauseListenting();

                services
                    .createWall( { name: 'parent wall' } )
                    .then( onWallCreated )
                    .then( onBoardCreated )
                    .catch( done );

                function onWallCreated( wall ) {
                    storedParentId = wall.getId();

                    return services
                        .createBoard( { wall: storedParentId, name: 'editable board' } );
                }

                function onBoardCreated( board ) {
                    storedId = board.getId();

                    queue.clearCalls();
                    application.startListening();

                    queue.once( 'boardeditor:displayed', onEditorDisplayed);

                    queue.trigger( 'board:edit', storedId );
                }

                function onEditorDisplayed( data ) {
                    should.exist( data );

                    var calls = queue.getCalls();

                    calls.length.should.be.equal( 2 );

                    calls[0].event.should.be.equal( 'board:edit' );
                    calls[1].event.should.be.equal( 'boardeditor:displayed' );

                    done();
                }
            });

        });

    });

};
