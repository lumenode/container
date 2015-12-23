'use strict';

require('should');
var Container = require('../Container');

describe('<Unit Test>', function () {
  describe('Container', function () {

    var ioc = new Container;

    beforeEach(function () {
      ioc.forgotAll();
    });

    after(function () {
      ioc.forgotAll();
    });

    it('binds items to IoC container', function () {
      ioc.bind('hash', HasherInstance);
      ioc.bind('config', ConfigInstance);

      // Assert
      var hasher = ioc.make('hash');
      hasher.should.be.instanceof(HasherInstance);
      hasher.make().should.be.equal('Make some hashing');

      var config = ioc.make('config');
      config.should.be.instanceof(ConfigInstance);
      config.grab().should.be.equal('Grab config');
    });

    it('injects dependencies', function () {
      ioc.bind('config', ConfigInstance);
      ioc.bind('star', StarInstance);

      var star = ioc.make('star');
      star.should.be.instanceof(StarInstance);
      star.config().grab().should.be.equal('Grab config');
    });

    it('removes all dependencies from own cache', function () {
      ioc.bindings.should.be.eql({});
      ioc.instances.should.be.eql({});
      ioc.resolved.should.be.eql({});

      // Bind something
      ioc.bind('hash', HasherInstance);
      ioc.bind('config', ConfigInstance);

      // Forgot
      ioc.forgotAll();

      // Assert
      ioc.bindings.should.be.eql({});
      ioc.instances.should.be.eql({});
      ioc.resolved.should.be.eql({});
    });

    it('throws an error on auto-inject if module cannot be resolved', function () {
      ioc.bind('star', StarInstance);

      (function () {
        ioc.make('star');
      }).should.throw(/Cannot find module/);
    });

    it('creates singleton', function () {
      ioc.singleton('singleton', SingletonInstance);

      var firstSingleton = ioc.make('singleton');
      var secondSingleton = ioc.make('singleton');

      firstSingleton.should.be.equal(secondSingleton);
      // Check random number
      firstSingleton.greet()
        .should.be.equal(secondSingleton.greet());
    });

    it('passes own params via closure', function () {
      ioc.bind('star', function () {
        var config = new ConfigInstance;

        return new StarInstance(config);
      });

      ioc.make('star').config().grab().should.equal('Grab config');
    });

    it('removes instances from ioc cache', function () {
      ioc.singleton('hash', HasherInstance);

      ioc.make('hash').make().should.be.equal('Make some hashing');
      ioc.forgetInstance('hash');
      (function () {
        ioc.make('hash');
      }).should.throw(/Cannot find module/);
    });

    it('creates aliases', function () {
      ioc.bind('hash', HasherInstance);
      ioc.alias('hash', 'hasher');

      ioc.make('hasher').make().should.be.eql('Make some hashing');
    });

    it('stores instances', function () {
      var hash = new HasherInstance;
      
      ioc.instance('foo', hash);
      ioc.make('foo').make().should.be.eql('Make some hashing');

      ioc.instance('foo', 'bar');
      ioc.make('foo').should.be.eql('bar');
    });

    it('dynamically rebounds instances', function () {
      ioc.bind('hello', function(foo) {
        return {
          foo: foo
        }
      });

      ioc.instance('foo', 'bar');
      ioc.make('hello').foo.should.be.eql('bar');

      ioc.instance('foo', 'new bar');
      ioc.make('hello').foo.should.be.eql('new bar');
    });

    it('can share closures', function () {
      ioc.singleton('foo', function() {
        return {
          hello: 'world',
          world: 'hello'
        }
      });

      var first = ioc.make('foo');
      var second = ioc.make('foo');

      first.should.be.equal(second);
    });

    it('can not register already registered instance using bindIf() method', function () {
      ioc.bindIf('foo', function() {
        return {hello: 'world'};
      });
      ioc.make('foo').hello.should.be.eql('world');

      ioc.bindIf('foo', HasherInstance);
      ioc.make('foo').hello.should.be.eql('world');
    });

    it('can call closure with dependencies', function () {
      ioc.instance('foobar', 'test value');
      ioc.instance('barfoo', 'demo value');

      ioc.call(function (id, foobar, barfoo) {
        foobar.should.be.equal('test value');
        barfoo.should.be.equal('demo value');
        id.should.be.eql('new id');
      }, {id: 'new id'});
    });

    it('resolves class with parameters', function () {
      ioc.instance('foo', 'bar');
      ioc.instance('bar', 'baz');

      ioc.bind('testing', function(bar, id, foo) {
        this.bar = bar;
        this.id = id;
        this.foo = foo;
      });

      var result = ioc.make('testing', {
        id: 'some id'
      });

      result.bar.should.be.eql('baz');
      result.id.should.be.eql('some id');
      result.foo.should.be.eql('bar');
    });

    it('can resolve class@method call via AT sign', function () {
      ioc.instance('foo', 'bar');
      ioc.instance('newfoo', 'baz');

      ioc.bind('TestFunctionAtSignCall', function(title, foo) {
        this.foo = foo;
        this.title = title;

        this.sayHello = function(id, newfoo) {
          this.id = id;
          this.newfoo = newfoo;

          return {
            foo: this.foo,
            newfoo: this.newfoo,
            id: this.id,
            title: this.title
          }
        };
      });

      var result = ioc.call('TestFunctionAtSignCall@sayHello', {
        id: 'test id',
        title: 'test title'
      });

      result.foo.should.be.eql('bar');
      result.newfoo.should.be.eql('baz');
      result.id.should.be.eql('test id');
      result.title.should.be.eql('test title');
    });

    /*
     * Config
     */
    function HasherInstance() {
      this.make = function () {
        return 'Make some hashing';
      };
    }

    function ConfigInstance() {
      this.grab = function () {
        return 'Grab config';
      };
    }

    function StarInstance(config) {
      this.config = function () {
        return config;
      };
    }

    function SingletonInstance() {
      var num = Math.random();

      this.greet = function () {
        return num;
      };
    }

  });
});
