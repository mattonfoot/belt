
var should = require('chai').should();
var RSVP = require('rsvp');
var Promise = RSVP.Promise;

var PouchDB = require('pouchdb');
var Model = require('../lib/model');

var fixtures = {
  "person": [
    {
      "name": "Jane",
      "age": 21,
      "birthday": new Date( '2013-03-21T00:00:00' )
    },
    {
      "name": "John",
      "age": 42,
      "birthday": new Date( '2010-03-14T00:00:00' )
    },
    {
      "name": "Richard",
      "age": 36,
      "birthday": new Date( '2005-03-07T00:00:00' )
    }
  ]
};

describe('using a model', function () {
  var db = {};
  var models = {};

  var dbIndex = 0;

  beforeEach(function () {
    dbIndex++;
    db = new PouchDB('belt_model_test_' + dbIndex, opts);
    models = {};

    for ( var name in fixtures ) {
      models[ name ] = new Model( db, name );
    }
  });

  afterEach(function ( done ) {
    var promises = [ db.destroy() ];

    for ( var name in fixtures ) {
      delete models[ name ];
    }

    RSVP.all( promises )
      .then(function () {
        done();
      })
      .catch( done );
  });

  var opts = {};
  if ( !process.browser ) {
    opts.db = require('memdown');
  }

  describe('to create new documents', function () {
    for ( var name in fixtures ) {
      ofType( name );
    }

    function ofType( schema ) {
      it('of the type "' + schema + '"', function ( done ) {
        var model = models[ schema ];

        var data = {
          name: 'sample ' + schema
        };

        model.post( data, function( error, resource ) {
          if ( error ) return done( error );

          should.exist( resource );

          resource.should.have.property( '_id' );

          resource.should.have.property( 'doctype' );
          resource.doctype.should.equal( schema );

          resource.should.have.property( 'name' );
          resource.name.should.equal( data.name );

          done();
        });

      });
    }
  });

  describe('to locate a specific document', function () {
    beforeEach(function ( done ) {
      var promises = [];

      var docs = this.docs = this.docs || {};

      for ( var name in fixtures ) {
        var fixture = fixtures[ name ];

        for (var i = 0, len = fixture.length; i < len; i++ ) {
          var data = fixture[ i ];

          var promise = postData( name, data );

          promises.push( promise );
        }
      }

      RSVP.all( promises )
        .then(function() {
          done();
        })
        .catch( done );

      function postData( schema, data ) {
        var model = models[ schema ];

        return new Promise(function( resolve, reject ) {
          model.post( data, function( error, resource ) {
            if ( error ) return reject( error );

            docs[ schema ] = docs[ schema ] || {};
            docs[ schema ][ resource._id ] = resource;

            resolve( resource );
          });
        });
      }
    });

    afterEach(function( done ) {
      var promises = [];

      var docs = this.docs = this.docs || {};

      for ( var name in fixtures ) {
        for ( var id in docs[ name ] ) {
          var promise = removeDoc( name, id );

          promises.push( promise );
        }
      }

      RSVP.all( promises )
        .then(function() {
          done();
        })
        .catch( done );

      function removeDoc( schema, id ) {
        var model = models[ schema ];

        return new Promise(function( resolve, reject ) {
          model.remove( id, function( error, resource ) {
            if ( error ) return reject( error );

            delete docs[ schema ][ resource._id ];

            resolve( resource );
          });
        });
      }
    });

    for ( var name in fixtures ) {
      ofType( name );
    }

    function ofType( schema ) {
      it('of the type "' + schema + '"', function ( done ) {
        var model = models[ schema ];

        var docs = this.docs = this.docs || {};

        var promises = [];

        for ( var id in docs[ schema ] ) {
          getDoc( id, docs[ schema ][ id ] );
        }

        RSVP.all( promises )
          .then(function() {
            done();
          })
          .catch( done );

        function getDoc( id, doc ) {
          var promise = new Promise(function( resolve, reject ) {
            model.get( id, function( error, resource ) {
              if ( error ) return reject( error );

              should.exist(resource);

              resource.should.have.property( '_id' );
              resource._id.should.equal( id );

              resource.should.have.property( 'doctype' );
              resource.doctype.should.equal( schema );

              resolve();
            });
          });

          promises.push( promise );
        }
      });
    }
  });

  describe('to patch a specific document', function () {
    beforeEach(function ( done ) {
      var promises = [];

      var docs = this.docs = this.docs || {};

      for ( var name in fixtures ) {
        var fixture = fixtures[ name ];

        for (var i = 0, len = fixture.length; i < len; i++ ) {
          var data = fixture[ i ];

          var promise = postData( name, data );

          promises.push( promise );
        }
      }

      RSVP.all( promises )
        .then(function() {
          done();
        })
        .catch( done );

      function postData( schema, data ) {
        var model = models[ schema ];

        return new Promise(function( resolve, reject ) {
          model.post( data, function( error, resource ) {
            if ( error ) return reject( error );

            docs[ schema ] = docs[ schema ] || {};
            docs[ schema ][ resource._id ] = resource;

            resolve( resource );
          });
        });
      }
    });

    afterEach(function( done ) {
      var promises = [];

      var docs = this.docs = this.docs || {};

      for ( var name in fixtures ) {
        for ( var id in docs[ name ] ) {
          var promise = removeDoc( name, id );

          promises.push( promise );
        }
      }

      RSVP.all( promises )
        .then(function() {
          done();
        })
        .catch( done );

      function removeDoc( schema, id ) {
        var model = models[ schema ];

        return new Promise(function( resolve, reject ) {
          model.remove( id, function( error, resource ) {
            if ( error ) return reject( error );

            delete docs[ schema ][ resource._id ];

            resolve( resource );
          });
        });
      }
    });

    it('by adding a property with a single string value', function ( done ) {
      var model = models.person;
      var ids = [];

      for ( var docid in this.docs.person ) {
        ids.push( docid );
      }

      var query = { _id: ids[ 0 ] };

      var patch = { op: 'add', path: '/special', value: 'bob' };

      model.patch( query, patch, function( error, resource ) {
        if (error) return done( error );

        should.exist( resource );

        resource.should.have.length( 1 );

        resource[0].should.have.property( '_id' );
        resource[0]._id.should.equal( query._id );

        resource[0].should.have.property( 'doctype' );
        resource[0].doctype.should.equal( 'person' );

        resource[0].should.have.property( 'special' );
        resource[0].special.should.equal( patch.value );

        done();
      });
    });

    it('by removing a property with a single string value', function ( done ) {
      var model = models.person;
      var ids = [];

      for ( var docid in this.docs.person ) {
        ids.push( docid );
      }

      var query = { _id: ids[ 0 ] };

      var patch = { op: 'remove', path: '/name' };

      model.patch( query, patch, function( error, resource ) {
        if (error) return done( error );

        should.exist( resource );

        resource.should.have.length( 1 );

        resource[0].should.have.property( '_id' );
        resource[0]._id.should.equal( query._id );

        resource[0].should.have.property( 'doctype' );
        resource[0].doctype.should.equal( 'person' );

        resource[0].should.not.have.property( 'name' );

        done();
      });
    });

    it('by replacing a property with a single string value', function ( done ) {
      var model = models.person;
      var ids = [];

      for ( var docid in this.docs.person ) {
        ids.push( docid );
      }

      var query = { _id: ids[ 0 ] };

      var patch = { op: 'replace', path: '/name', value: 'bob' };

      model.patch( query, patch, function( error, resource ) {
        if (error) return done( error );

        should.exist( resource );

        resource.should.have.length( 1 );

        resource[0].should.have.property( '_id' );
        resource[0]._id.should.equal( query._id );

        resource[0].should.have.property( 'doctype' );
        resource[0].doctype.should.equal( 'person' );

        resource[0].should.have.property( 'name' );
        resource[0].name.should.equal( patch.value );

        done();
      });
    });

    it('by adding a value to a property that is an array', function ( done ) {
      var model = models.person;
      var ids = [];

      for ( var docid in this.docs.person ) {
        ids.push( docid );
      }

      var query = { _id: ids[ 0 ] };

      var patch = [
        { op: 'add', path: '/list', value: [] },
        { op: 'add', path: '/list/1', value: 'ernie' }
      ];

      model.patch( query, patch, function( error, resource ) {
        if (error) return done( error );

        should.exist( resource );

        resource.should.have.length( 1 );

        resource[0].should.have.property( '_id' );
        resource[0]._id.should.equal( query._id );

        resource[0].should.have.property( 'doctype' );
        resource[0].doctype.should.equal( 'person' );

        resource[0].should.have.property( 'list' );
        resource[0].list.should.be.an( 'array' );
        resource[0].list.should.not.include( 'bert' );
        resource[0].list.should.include( 'ernie' );

        done();
      });
    });

    it('by removing a value in a property that is an array', function ( done ) {
      var model = models.person;
      var ids = [];

      for ( var docid in this.docs.person ) {
        ids.push( docid );
      }

      var query = { _id: ids[ 0 ] };

      var patch = [
        { op: 'add', path: '/list', value: [ 'bert', 'ernie' ] },
        { op: 'remove', path: '/list/bert' }
      ];

      model.patch( query, patch, function( error, resource ) {
        if (error) return done( error );

        should.exist( resource );

        resource.should.have.length( 1 );

        resource[0].should.have.property( '_id' );
        resource[0]._id.should.equal( query._id );

        resource[0].should.have.property( 'doctype' );
        resource[0].doctype.should.equal( 'person' );

        resource[0].should.have.property( 'list' );
        resource[0].list.should.be.an( 'array' );
        resource[0].list.should.not.include( 'bert' );
        resource[0].list.should.include( 'ernie' );

        done();
      });
    });
  });

});
