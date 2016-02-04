'use strict';

require('should');
let Container = require('../Container');

describe('<Unit Test>', () => {
  describe('Container', () => {

    let ioc = new Container;

    beforeEach(() => ioc.forgotAll());
    after(() => ioc.forgotAll());

    it('binds items to IoC container', () => {
      ioc.bind('hash', HasherInstance);
      ioc.bind('config', ConfigInstance);
      ioc.bind('class', ClassInstance);

      // Assert
      let hasher = ioc.make('hash');
      hasher.should.be.instanceof(HasherInstance);
      hasher.make().should.be.equal('Make some hashing');

      let config = ioc.make('config');
      config.should.be.instanceof(ConfigInstance);
      config.grab().should.be.equal('Grab config');

      let classInstance = ioc.make('class');
      classInstance.should.be.instanceof(ClassInstance);
      classInstance.foo().should.be.equal('from ClassInstance');
    });

    it('injects dependencies', () => {
      ioc.bind('config', ConfigInstance);
      ioc.bind('star', StarInstance);
      ioc.bind('class', ClassInstance2);

      let star = ioc.make('star');
      star.should.be.instanceof(StarInstance);
      star.config().grab().should.be.equal('Grab config');

      let classInstance = ioc.make('class');
      classInstance.should.be.instanceof(ClassInstance2);
      classInstance.config().grab().should.be.equal('Grab config');
    });

    it('removes all dependencies from own cache', () => {
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

    it('throws an error on auto-inject if module cannot be resolved', () => {
      ioc.bind('star', StarInstance);

      (() => {
        ioc.make('star');
      }).should.throw(/Cannot find module/);
    });

    it('creates singleton', () => {
      ioc.singleton('singleton', SingletonInstance);

      let firstSingleton = ioc.make('singleton');
      let secondSingleton = ioc.make('singleton');

      firstSingleton.should.be.equal(secondSingleton);
      // Check random number
      firstSingleton.greet()
        .should.be.equal(secondSingleton.greet());
    });

    it('passes own params via class expression', () => {
      ioc.bind('star', class {
        constructor() {
          let config = new ConfigInstance;

          return new StarInstance(config);
        }
      });

      ioc.make('star').config().grab().should.equal('Grab config');
    });

    it('removes instances from ioc cache', () => {
      ioc.singleton('hash', HasherInstance);

      ioc.make('hash').make().should.be.equal('Make some hashing');
      ioc.forgetInstance('hash');
      (() => {
        ioc.make('hash');
      }).should.throw(/Cannot find module/);
    });

    it('creates aliases', () => {
      ioc.bind('hash', HasherInstance);
      ioc.alias('hash', 'hasher');

      ioc.bind('class', ClassInstance);
      ioc.alias('class', 'class-alias');

      ioc.make('hasher').make().should.be.eql('Make some hashing');
      ioc.make('class-alias').foo().should.be.eql('from ClassInstance');
    });

    it('stores instances', () => {
      let hash = new HasherInstance;
      let classInstance = new ClassInstance;
      
      ioc.instance('foo', hash);
      ioc.make('foo').make().should.be.eql('Make some hashing');

      ioc.instance('foo', 'bar');
      ioc.make('foo').should.be.eql('bar');

      ioc.instance('classInstance', classInstance);
      ioc.make('classInstance').foo().should.be.eql('from ClassInstance');
    });

    it('dynamically rebounds instances', () => {
      ioc.bind('hello', class {
        constructor(foo) {
          return {foo};
        }
      });

      ioc.instance('foo', 'bar');
      ioc.make('hello').foo.should.be.eql('bar');

      ioc.instance('foo', 'new bar');
      ioc.make('hello').foo.should.be.eql('new bar');
    });

    it('can share closures', () => {
      ioc.singleton('foo', class {
        constructor() {
          return {
            hello: 'world',
            world: 'hello'
          }
        }
      });

      let first = ioc.make('foo');
      let second = ioc.make('foo');

      first.should.be.equal(second);
    });

    it('can share class expressions', () => {
      ioc.singleton('class', class {
        constructor() {
          return {
            hello: 'world',
            world: 'hello'
          }
        }
      });

      let first = ioc.make('class');
      let second = ioc.make('class');

      first.should.be.equal(second);
    });

    it('can not register already registered instance using bindIf() method', () => {
      ioc.bindIf('foo', class {
        constructor() {
          return {hello: 'world'};
        }
      });
      ioc.make('foo').hello.should.be.eql('world');

      ioc.bindIf('foo', HasherInstance);
      ioc.make('foo').hello.should.be.eql('world');
    });

    it('can call closure with dependencies', () => {
      ioc.instance('foobar', 'test value');
      ioc.instance('barfoo', 'demo value');

      ioc.call(function(id, foobar, barfoo) {
        foobar.should.be.equal('test value');
        barfoo.should.be.equal('demo value');
        id.should.be.eql('new id');
      }, {id: 'new id'});

      ioc.call((id, foobar, barfoo) => {
        foobar.should.be.equal('test value');
        barfoo.should.be.equal('demo value');
        id.should.be.eql('new id');
      }, {id: 'new id'});
    });

    it('resolves class (functional) with parameters', () => {
      ioc.instance('foo', 'bar');
      ioc.instance('bar', 'baz');

      ioc.bind('testing', function (bar, id, foo) {
        this.bar = bar;
        this.id = id;
        this.foo = foo;
      });

      let result = ioc.make('testing', {
        id: 'some id'
      });

      result.bar.should.be.eql('baz');
      result.id.should.be.eql('some id');
      result.foo.should.be.eql('bar');
    });

    it('resolves class (non-functional) with parameters', () => {
      ioc.instance('foo', 'bar');
      ioc.instance('bar', 'baz');

      ioc.bind('testing', class {
        constructor(bar, id, foo) {
          this.bar = bar;
          this.id = id;
          this.foo = foo;
        }
      });

      let result = ioc.make('testing', {
        id: 'some id'
      });

      result.bar.should.be.eql('baz');
      result.id.should.be.eql('some id');
      result.foo.should.be.eql('bar');
    });

    it('can resolve class@method (functional) call via AT sign', () => {
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

      let result = ioc.call('TestFunctionAtSignCall@sayHello', {
        id: 'test id',
        title: 'test title'
      });

      result.foo.should.be.eql('bar');
      result.newfoo.should.be.eql('baz');
      result.id.should.be.eql('test id');
      result.title.should.be.eql('test title');
    });

    it('can resolve class@method (non-functional) call via AT sign', function () {
      ioc.instance('foo', 'bar');
      ioc.instance('newfoo', 'baz');

      ioc.bind('TestFunctionAtSignCall', class {
        
        constructor(title, foo) {
          this.foo = foo;
          this.title = title;
        }

        sayHello(id, newfoo) {
          this.id = id;
          this.newfoo = newfoo;

          return {
            foo: this.foo,
            newfoo: this.newfoo,
            id: this.id,
            title: this.title
          }
        }

      });

      let result = ioc.call('TestFunctionAtSignCall@sayHello', {
        id: 'test id',
        title: 'test title'
      });

      result.foo.should.be.eql('bar');
      result.newfoo.should.be.eql('baz');
      result.id.should.be.eql('test id');
      result.title.should.be.eql('test title');
    });

    class ClassInstance {
      foo() {
        return 'from ClassInstance';
      }
    }

    class ClassInstance2 {

      constructor(config) {
        this.Config = config;
      }

      config() {
        return this.Config;
      }

    }

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
      let num = Math.random();

      this.greet = function () {
        return num;
      };
    }

  });
});
