'use strict';

function Container() {
  this.instance = null;

  this.bindings = {};
  this.instances = {};
  this.resolved = {};
  this.aliases = {};

  this.getInstance = function () {
    return this.instance ? this.instance : new Container;
  };

  /**
   * Register a binding with the container.
   *
   * @param  {String}               abstract Abstract value to be registered
   * @param  {Function|String|null} concrete Concrete
   * @param  {Boolean}              shared   You wanna shared binding?
   * @return {void}
   */
  this.bind = function (abstract, concrete, shared) {
    this.dropStaleInstances(abstract);

    this.bindings[abstract] = {
      concrete: concrete,
      shared: !!shared
    };
  };

  /**
   * Register a binding if it hasn't already been registered.
   *
   * @param  {String}               abstract Abstract value to be registered
   * @param  {Function|String|null} concrete Concrete
   * @param  {Boolean}              shared   You wanna shared binding?
   * @return {void}
   */
  this.bindIf = function(abstract, concrete, shared) {
    if ( ! this.bound(abstract)) {
      this.bind(abstract, concrete, shared);
    };
  };

  /*
   * Create singleton
   *
   * @return Object
   */
  this.singleton = function (abstract, concrete) {
    return this.bind(abstract, concrete, true);
  };

  this.make = function (abstract, parameters) {
    parameters = parameters || [];
    abstract = this.getAlias(abstract);

    // If an instance of the type is currently being managed as a singleton we'll
    // just return an existing instance instead of instantiating new instances
    // so the developer can keep using the same objects instance every time.
    if (this.instances[abstract]) {
      return this.instances[abstract];
    }

    var concrete = this.getConcrete(abstract);

    // We're ready to instantiate an instance of the concrete type registered for
    // the binding. This will instantiate the types, as well as resolve any of
    // its "nested" dependencies recursively until all have gotten resolved.
    var object = this.isBuildable(concrete, abstract) 
      ? this.build(concrete, parameters) 
      : this.make(concrete, parameters);

    // If the requested type is registered as a singleton we'll want to cache off
    // the instances in "memory" so we can return it later without creating an
    // entirely new instance of an object on each subsequent request for it.
    if (this.isShared(abstract)) {
      this.instances[abstract] = object;
    }

    this.resolved[abstract] = true;

    return object;
  };

  /*
   * Check if we have faced singleton
   *
   * @return Boolean
   */
  this.isShared = function (abstract) {
    var shared = false;

    if (this.bindings[abstract] !== undefined && this.bindings[abstract].shared) {
      shared = this.bindings[abstract].shared;
    }

    return this.instances[abstract] !== undefined || shared === true;
  };

  /*
   * Instantiate a concrete instance of the given type.
   *
   * @return Object
   */
  this.build = function (concrete, parameters) {
    if (this.needAutoInject(concrete)) {
      var className = concrete.replace(/\+/, '');
      var module = require(className);

      concrete = module;
    }

    // Get dependencies
    var constructor = concrete;
    var dependencyArguments = this.parseFunctionArguments(constructor);
    var instances = this.getDependencies(dependencyArguments, parameters);

    return this.instantiateClass(concrete, instances);
  };

  /*
   * Check if given concrete need to be auto-injected
   *
   * @return Boolean
   */
  this.needAutoInject = function (concrete) {
    return typeof concrete !== 'function' && concrete.match(/^\+/i);
  };

  /*
   * Create new instance of the given class with injected arguments
   *
   * @return Object
   */
  this.instantiateClass = function (concrete, instances) {
    instances.unshift(concrete);

    return new(Function.prototype.bind.apply(concrete, instances));
  };

  /*
   * Resolve arguments (get list of `injectables`)
   *
   * @return Array
   */
  this.getDependencies = function (dependencyArguments, parameters) {
    var dependencies = [];

    dependencyArguments.forEach(function(dependency) {
      if (parameters[dependency] !== undefined) {
        dependencies.push(parameters[dependency]);
      } else {
        dependencies.push(this.make(dependency));
      };
    }.bind(this));

    return dependencies;
  };

  /*
   * Parse fn's arguments to be able to auto-inject them
   *
   * @return Array
   */
  this.parseFunctionArguments = function (concrete) {
    var args = concrete.toString().match(/^function\s*[^\(]*\(\s*([^\)]*)\)/m);
    var dependencies = [];

    if (args === null || args.length < 1) {
      return [];
    }
    var deps = args[1].replace(/\s/g, '').split(',');

    for (var i = 0; i < deps.length; i++) {
      if (deps[i].length > 0) {
        dependencies.push(deps[i]);
      }
    }

    return dependencies;
  };

  /*
   * Check if we can `build` concreate otherwise will re-make() it
   *
   * @return Boolean
   */
  this.isBuildable = function (concrete, abstract) {
    return concrete === abstract || typeof concrete === 'function';
  };

  /*
   * Resolve instance out of IoC container or return string to autoload it
   *
   * @return Object|String
   */
  this.getConcrete = function (abstract) {
    // If we don't have a registered resolver or concrete for the type, we'll just
    // assume each type is a concrete name and will attempt to resolve it as is
    // since the container should be able to resolve concretes automatically.
    if (!this.bindings[abstract]) {
      if (abstract.match(/^\+/i)) {
        return abstract;
      }

      return '+' + abstract;
    }

    return this.bindings[abstract].concrete;
  };

  /**
   * Register alias. Simple as that.
   *
   * @param  {String} abstract Abstract value to be aliased
   * @param  {String} alias    Alias for given abstraction
   * @return {void}
   */
  this.alias = function(abstract, alias) {
    this.aliases[alias] = abstract;
  };

  /**
   * Resolve abstraction name of given alias.
   *
   * @param  {String} abstract Abstract or alias
   * @return {String}          Real abstraction name
   */
  this.getAlias = function(abstract) {
    return this.aliases[abstract] ? this.aliases[abstract] : abstract;
  };

  this.instance = function(abstract, instance) {
    delete this.aliases[abstract];

    this.instances[abstract] = instance;
  };

  /**
   * Check if abstract is already bound to our conrainer.
   *
   * @param  {String} abstract Abstract
   * @return {Boolean}         Abstract is bound to our container
   */
  this.bound = function(abstract) {
    return this.bindings[abstract] || this.instances[abstract] || this.isAlias(abstract);
  };

  /**
   * Check if current abstract is an alias.
   *
   * @param  {String}  abstract Abstract
   * @return {Boolean}          Abstract if an alias
   */
  this.isAlias = function(abstract) {
    return this.aliases[abstract];
  };

  /**
   * Call the given Closure / class@method and inject its dependencies.
   *
   * @param  {Function|String} callback      Callback to be called
   *                                         Method to be executed
   * @param  {Array}           parameters    Parameters
   * @param  {String}          defaultMethod Method to execute by default
   * @return {*}                             Result of closure/method call
   */
  this.call = function(callback, parameters, defaultMethod) {
    parameters = parameters || [];

    if (this.isCallableWithAtSign(callback) || defaultMethod) {
      return this.callClass(callback, parameters, defaultMethod);
    };

    var dependencies = this.getMethodDependencies(callback, parameters);

    return this.executeCallable(callback, dependencies);
  };

  /**
   * Execute simple callback or call a method under instance
   * with custom arguments.
   *
   * @param  {Function|Array} callback     Callback or [instance, method]
   * @param  {Object}         dependencies List of arguments to be passed
   * @return {*}                           Result of closure/method call
   */
  this.executeCallable = function(callback, dependencies) {
    if (typeof callback === 'function') {
      return callback.apply(callback, dependencies);
    };

    var instance = callback[0];
    var method = callback[1];

    return instance[method].apply(instance, dependencies);
  };

  /**
   * Resolve method dependencies and merge with parameters.
   *
   * @param  {Function|String} callback    Callback to be called
   *                                       Method to be executed
   * @param  {Object}          parameters  List of arguments to be passed
   * @return {Array}                       List of resolved dependensies + merged parameters
   */
  this.getMethodDependencies = function(callback, parameters) {
    var dependencies = [];

    this.getCallRefrector(callback).forEach(function(parameter) {
      this.addDependencyForCallParameter(parameter, parameters, dependencies);
    }.bind(this));

    return dependencies;
  };

  /**
   * Merge dependencies with given parameters.
   *
   * @param {String} parameter    Parameter/dependency name
   * @param {[type]} parameters   [description]
   * @param {[type]} dependencies [description]
   */
  this.addDependencyForCallParameter = function(parameter, parameters, dependencies) {
    if (parameters[parameter] !== undefined) {
      dependencies.push(parameters[parameter]);

      delete parameters[parameter];
    } else {
      dependencies.push(this.make(parameter, parameters));
    };
  };

  this.getCallRefrector = function(callback) {
    if (typeof callback === 'function') {
      return this.parseFunctionArguments(callback);
    };

    var instance = callback[0];
    var method = callback[1];

    return this.parseFunctionArguments(instance[method]);
  };

  /**
   * Determine if the given string is in Class@method syntax.
   *
   * @param  {Function} callback Callback to be called
   * @return {Boolean}
   */
  this.isCallableWithAtSign = function(callback) {
    if (typeof callback !== 'string') {
      return false;
    };

    return callback.match(/@/i);
  };

  this.callClass = function(target, parameters, defaultMethod) {
    var segments = target.split('@');
    var method = segments.length === 2 ? segments[1] : defaultMethod;

    if ( ! method) {
      return exception('InvalidArgumentException', 'Method is not provided.');
    }

    return this.call([this.make(segments[0], parameters), method], parameters);
  };

  /*
   * Remove instance
   *
   * @return void
   */
  this.dropStaleInstances = function (abstract) {
    delete this.instances[abstract];
  };

  /*
   * Remove a resolved instance from the instance cache.
   *
   */
  this.forgetInstance = function (abstract) {
    delete this.instances[abstract];
    delete this.bindings[abstract];
    delete this.aliases[abstract];
  };

  this.forgotAll = function () {
    this.bindings = {};
    this.instances = {};
    this.resolved = {};
    this.aliases = {};
  };

}

module.exports = Container;
