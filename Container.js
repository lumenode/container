'use strict';

class Container {

  constructor() {
    this.bindings = {};
    this.instances = {};
    this.resolved = {};
    this.aliases = {};
  }

  /**
   * Register a binding with the container.
   *
   * @param  {String}               abstract Abstract value to be registered
   * @param  {Function|String|null} concrete Concrete
   * @param  {Boolean}              shared   You wanna shared binding?
   * @return {void}
   */
  bind(abstract, concrete, shared) {
    this.dropStaleInstances(abstract);

    this.bindings[abstract] = {
      concrete: concrete,
      shared: !!shared
    }
  }

  /**
   * Register a binding if it hasn't already been registered.
   *
   * @param  {String}               abstract Abstract value to be registered
   * @param  {Function|String|null} concrete Concrete
   * @param  {Boolean}              shared   You wanna shared binding?
   * @return {void}
   */
  bindIf(abstract, concrete, shared) {
    if ( ! this.bound(abstract)) {
      this.bind(abstract, concrete, shared);
    }
  }

  /*
   * Create singleton
   *
   * @return Object
   */
  singleton(abstract, concrete) {
    return this.bind(abstract, concrete, true);
  }

  make(abstract, parameters) {
    parameters = parameters || [];
    abstract = this.getAlias(abstract);

    // If an instance of the type is currently being managed as a singleton we'll
    // just return an existing instance instead of instantiating new instances
    // so the developer can keep using the same objects instance every time.
    if (this.instances[abstract]) {
      return this.instances[abstract];
    }

    let concrete = this.getConcrete(abstract);

    // We're ready to instantiate an instance of the concrete type registered for
    // the binding. This will instantiate the types, as well as resolve any of
    // its "nested" dependencies recursively until all have gotten resolved.
    let object = this.isBuildable(concrete, abstract) 
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
  }

  /*
   * Check if we have faced singleton
   *
   * @return Boolean
   */
  isShared(abstract) {
    let shared = false;

    if (this.bindings[abstract] !== undefined && this.bindings[abstract].shared) {
      shared = this.bindings[abstract].shared;
    }

    return this.instances[abstract] !== undefined || shared === true;
  }

  /*
   * Instantiate a concrete instance of the given type.
   *
   * @return Object
   */
  build(concrete, parameters) {
    if (this.needAutoInject(concrete)) {
      let className = concrete.replace(/\+/, '');
      let module = require(className);

      concrete = module;
    }

    // Get dependencies
    let constructor = concrete;
    let dependencyArguments = this.parseFunctionArguments(constructor);
    let instances = this.getDependencies(dependencyArguments, parameters);

    return this.instantiateClass(concrete, instances);
  }

  /*
   * Check if given concrete need to be auto-injected
   *
   * @return Boolean
   */
  needAutoInject(concrete) {
    return typeof concrete !== 'function' && concrete.match(/^\+/i);
  }

  /*
   * Create new instance of the given class with injected arguments
   *
   * @return Object
   */
  instantiateClass(concrete, instances) {
    instances.unshift(concrete);

    return new(Function.prototype.bind.apply(concrete, instances));
  }

  /*
   * Resolve arguments (get list of `injectables`)
   *
   * @return Array
   */
  getDependencies(dependencyArguments, parameters) {
    let dependencies = [];

    dependencyArguments.forEach(dependency => {
      if (parameters[dependency] !== undefined) {
        dependencies.push(parameters[dependency]);
      } else {
        dependencies.push(this.make(dependency));
      }
    });

    return dependencies;
  }

  /*
   * Parse fn's arguments to be able to auto-inject them
   *
   * @return Array
   */
  parseFunctionArguments(concrete) {
    let args = concrete.toString().match(/^(?:function)?\s*[^\(]*\(\s*([^\)]*)\)/m);
    let dependencies = [];

    if (args === null || args.length < 1) {
      return [];
    }
    let deps = args[1].replace(/\s/g, '').split(',');

    for (let i = 0; i < deps.length; i++) {
      if (deps[i].length > 0) {
        dependencies.push(deps[i]);
      }
    }

    return dependencies;
  }

  /*
   * Check if we can `build` concreate otherwise will re-make() it
   *
   * @return Boolean
   */
  isBuildable(concrete, abstract) {
    return concrete === abstract || typeof concrete === 'function';
  }

  /*
   * Resolve instance out of IoC container or return string to autoload it
   *
   * @return Object|String
   */
  getConcrete(abstract) {
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
  }

  /**
   * Register alias. Simple as that.
   *
   * @param  {String} abstract Abstract value to be aliased
   * @param  {String} alias    Alias for given abstraction
   * @return {void}
   */
  alias(abstract, alias) {
    this.aliases[alias] = abstract;
  }

  /**
   * Resolve abstraction name of given alias.
   *
   * @param  {String} abstract Abstract or alias
   * @return {String}          Real abstraction name
   */
  getAlias(abstract) {
    return this.aliases[abstract] ? this.aliases[abstract] : abstract;
  }

  instance(abstract, instance) {
    delete this.aliases[abstract];

    this.instances[abstract] = instance;
  }

  /**
   * Check if abstract is already bound to our conrainer.
   *
   * @param  {String} abstract Abstract
   * @return {Boolean}         Abstract is bound to our container
   */
  bound(abstract) {
    return this.bindings[abstract] || this.instances[abstract] || this.isAlias(abstract);
  }

  /**
   * Check if current abstract is an alias.
   *
   * @param  {String}  abstract Abstract
   * @return {Boolean}          Abstract if an alias
   */
  isAlias(abstract) {
    return this.aliases[abstract];
  }

  /**
   * Call the given Closure / class@method and inject its dependencies.
   *
   * @param  {Function|String} callback      Callback to be called
   *                                         Method to be executed
   * @param  {Array}           parameters    Parameters
   * @param  {String}          defaultMethod Method to execute by default
   * @return {*}                             Result of closure/method call
   */
  call(callback, parameters, defaultMethod) {
    parameters = parameters || [];

    if (this.isCallableWithAtSign(callback) || defaultMethod) {
      return this.callClass(callback, parameters, defaultMethod);
    }

    let dependencies = this.getMethodDependencies(callback, parameters);

    return this.executeCallable(callback, dependencies);
  }

  /**
   * Execute simple callback or call a method under instance
   * with custom arguments.
   *
   * @param  {Function|Array} callback     Callback or [instance, method]
   * @param  {Object}         dependencies List of arguments to be passed
   * @return {*}                           Result of closure/method call
   */
  executeCallable(callback, dependencies) {
    if (typeof callback === 'function') {
      return callback.apply(callback, dependencies);
    }

    let instance = callback[0];
    let method = callback[1];

    return instance[method].apply(instance, dependencies);
  }

  /**
   * Resolve method dependencies and merge with parameters.
   *
   * @param  {Function|String} callback    Callback to be called
   *                                       Method to be executed
   * @param  {Object}          parameters  List of arguments to be passed
   * @return {Array}                       List of resolved dependensies + merged parameters
   */
  getMethodDependencies(callback, parameters) {
    let dependencies = [];

    this.getCallRefrector(callback).forEach(parameter => {
      this.addDependencyForCallParameter(parameter, parameters, dependencies);
    });

    return dependencies;
  }

  /**
   * Merge dependencies with given parameters.
   *
   * @param {String} parameter    Parameter/dependency name
   * @param {[type]} parameters   [description]
   * @param {[type]} dependencies [description]
   */
  addDependencyForCallParameter(parameter, parameters, dependencies) {
    if (parameters[parameter] !== undefined) {
      dependencies.push(parameters[parameter]);

      delete parameters[parameter];
    } else {
      dependencies.push(this.make(parameter, parameters));
    }
  }

  getCallRefrector(callback) {
    if (typeof callback === 'function') {
      return this.parseFunctionArguments(callback);
    };

    let instance = callback[0];
    let method = callback[1];

    return this.parseFunctionArguments(instance[method]);
  }

  /**
   * Determine if the given string is in Class@method syntax.
   *
   * @param  {Function} callback Callback to be called
   * @return {Boolean}
   */
  isCallableWithAtSign(callback) {
    if (typeof callback !== 'string') {
      return false;
    };

    return callback.match(/@/i);
  }

  callClass(target, parameters, defaultMethod) {
    let segments = target.split('@');
    let method = segments.length === 2 ? segments[1] : defaultMethod;

    if ( ! method) {
      return exception('InvalidArgumentException', 'Method is not provided.');
    }

    return this.call([this.make(segments[0], parameters), method], parameters);
  }

  /*
   * Remove instance
   *
   * @return void
   */
  dropStaleInstances(abstract) {
    delete this.instances[abstract];
  }

  /*
   * Remove a resolved instance from the instance cache.
   *
   */
  forgetInstance(abstract) {
    delete this.instances[abstract];
    delete this.bindings[abstract];
    delete this.aliases[abstract];
  }

  forgotAll() {
    this.bindings = {};
    this.instances = {};
    this.resolved = {};
    this.aliases = {};
  }

}

module.exports = Container;
