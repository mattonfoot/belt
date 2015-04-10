
var should = require('chai').should();
var RSVP = require('rsvp');
var Promise = RSVP.Promise;

var Repository = require('../lib/repository');

describe('resource serialization', function () {

  describe('when creating a document', function () {

    it( 'will store values in the database', function ( done ) {
      var fakeDB = new FakePouch();
      var repository = new Repository( fakeDB );

      repository.schema( 'simple', {
        testString: String,
        testDate: Date,
        testNumber: Number
      }, true );

      var data = {
        testString: 'a test',
        testDate: new Date(),
        testNumber: 12345
      };

      repository.create( 'simple', data )
        .then(function() {
          var resource = fakeDB.data;

          should.exist( resource );

          resource.should.not.have.property( 'id' );
          resource.should.not.have.property( 'rev' );

          resource.should.have.property( 'doctype', 'simple' );

          resource.should.have.property( 'testString' );
          resource.testString.should.be.a( 'string' );
          resource.testString.should.equal( data.testString );

          resource.should.have.property( 'testDate' );
          resource.testDate.should.be.a( 'date' );
          resource.testDate.should.deep.equal( data.testDate );

          resource.should.have.property( 'testNumber' );
          resource.testNumber.should.be.a( 'number' );
          resource.testNumber.should.equal( data.testNumber );

          done();
        })
        .catch( done );
    });

    it( 'will not store missing, undefined or null values in the database', function ( done ) {
      var fakeDB = new FakePouch();
      var repository = new Repository( fakeDB );

      repository.schema( 'simple', {
        testString: String,
        testDate: Date,
        testNumber: Number
      }, true );

      var data = {
        testString: undefined,
        testNumber: null,
      };

      repository.create( 'simple', data )
        .then(function() {
          var resource = fakeDB.data;

          should.exist( resource );

          resource.should.not.have.property( 'id' );
          resource.should.not.have.property( 'rev' );

          resource.should.have.property( 'doctype', 'simple' );

          resource.should.not.have.property( 'testString' );
          resource.should.not.have.property( 'testDate' );
          resource.should.not.have.property( 'testNumber' );

          done();
        })
        .catch( done );
    });

    it( 'will not store missing, undefined or null one to one link properties in the database', function ( done ) {
      var fakeDB = new FakePouch();
      var repository = new Repository( fakeDB );

      repository.schema( 'simple', {
        linkedIds: 'simple',
        linkedNullIds: 'simple',
        linkedUndefinedIds: 'simple'
      }, true );

      var data = {
        linkedIds: 'linked-id',
        linkedNullIds: null,
        linkedUndefinedIds: undefined
      };

      repository.create( 'simple', data )
        .then(function() {
          var resource = fakeDB.data;

          should.exist( resource );

          resource.should.not.have.property( 'id' );
          resource.should.not.have.property( 'rev' );

          resource.should.have.property( 'doctype', 'simple' );

          resource.should.have.property( 'linkedIds', 'linked-id' );
          resource.should.not.have.property( 'linkedNullIds' );
          resource.should.not.have.property( 'linkedUndefinedIds' );

          done();
        })
        .catch( done );
    });

    it( 'will store all many to many link properties in the database', function ( done ) {
      var fakeDB = new FakePouch();
      var repository = new Repository( fakeDB );

      repository.schema( 'simple', {
        linkedIds: [ 'simple' ],
        linkedEmptyIds: [ 'simple' ],
        linkedUndefinedIds: [ 'simple' ]
      }, true );

      var data = {
        linkedIds: [ 'linked-id' ],
        linkedEmptyIds: []
      };

      repository.create( 'simple', data )
        .then(function() {
          var resource = fakeDB.data;

          should.exist( resource );

          resource.should.not.have.property( 'id' );
          resource.should.not.have.property( 'rev' );

          resource.should.have.property( 'doctype', 'simple' );

          resource.should.have.property( 'linkedIds' );
          resource.linkedIds.should.have.length( 1 );
          resource.linkedIds.should.contain( 'linked-id' );

          resource.should.have.property( 'linkedEmptyIds' );
          resource.linkedEmptyIds.should.have.length( 0 );

          resource.should.have.property( 'linkedUndefinedIds' );
          resource.linkedUndefinedIds.should.have.length( 0 );

          done();
        })
        .catch( done );
    });

  });

  describe('when updating a document', function () {

    it( 'will store values in the database', function ( done ) {
      var fakeDB = new FakePouch();
      var repository = new Repository( fakeDB );

      repository.schema( 'simple', {
        testString: String,
        testDate: Date,
        testNumber: Number
      }, true );

      var data = {
        id: 'fake-id',
        testString: 'a test',
        testDate: new Date(),
        testNumber: 12345
      };

      repository.update( 'simple', data )
        .then(function() {
          var resource = fakeDB.data;

          should.exist( resource );

          resource.should.not.have.property( 'id' );
          resource.should.not.have.property( 'rev' );

          resource.should.have.property( 'doctype', 'simple' );

          resource.should.have.property( 'testString' );
          resource.testString.should.be.a( 'string' );
          resource.testString.should.equal( data.testString );

          resource.should.have.property( 'testDate' );
          resource.testDate.should.be.a( 'date' );
          resource.testDate.should.deep.equal( data.testDate );

          resource.should.have.property( 'testNumber' );
          resource.testNumber.should.be.a( 'number' );
          resource.testNumber.should.equal( data.testNumber );

          done();
        })
        .catch( done );
    });

    it( 'will not store missing, undefined or null values in the database', function ( done ) {
      var fakeDB = new FakePouch();
      var repository = new Repository( fakeDB );

      repository.schema( 'simple', {
        testString: String,
        testDate: Date,
        testNumber: Number
      }, true );

      var data = {
        testString: undefined,
        testNumber: null,
      };

      repository.update( 'simple', data )
        .then(function() {
          var resource = fakeDB.data;

          should.exist( resource );

          resource.should.not.have.property( 'id' );
          resource.should.not.have.property( 'rev' );

          resource.should.have.property( 'doctype', 'simple' );

          resource.should.not.have.property( 'testString' );
          resource.should.not.have.property( 'testDate' );
          resource.should.not.have.property( 'testNumber' );

          done();
        })
        .catch( done );
    });

  });

});

function FakePouch() {
}

FakePouch.prototype.constructor = FakePouch;

FakePouch.prototype.on = function() {
  return this;
};

FakePouch.prototype.post = function( data, cb ) {
  this.data = data;

  return cb && cb( undefined, data );
};

FakePouch.prototype.put = function( data, id, rev, cb ) {
  this.data = data;

  return cb && cb( undefined, data );
};

FakePouch.prototype.get = function( id, cb ) {
  return cb && cb( undefined, { id: 'fake-id' } );
};

FakePouch.prototype.query = function( query, options, cb ) {
  return cb && cb( undefined, [{
    id: 'linked-id',
    linkedIds: [],
    linkedEmptyIds: [],
    linkedUndefinedIds: []
  }]);
};

FakePouch.prototype.allDocs = function( query, cb ) {
  return cb && cb( undefined, [{
    id: 'linked-id',
    linkedIds: [],
    linkedEmptyIds: [],
    linkedUndefinedIds: []
  }]);
};

FakePouch.prototype.bulkDocs = function( updates, cb ) {
  return cb && cb( undefined, updates );
};
