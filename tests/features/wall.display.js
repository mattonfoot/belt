module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Wall:Display', function() {

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

    });

};
