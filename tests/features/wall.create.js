module.exports = function( should, RSVP, Promise, debug, queue, ui, application, belt, services ) {

    describe('Wall:Create', function() {

        describe('Triggering the creation of a wall', function() {
            var storedName = 'new wall';

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

    });

};
