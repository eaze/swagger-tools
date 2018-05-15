(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}(g.SwaggerTools || (g.SwaggerTools = {})).specs = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
(function (global){
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = (typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null);
var JsonRefs = (typeof window !== "undefined" ? window['JsonRefs'] : typeof global !== "undefined" ? global['JsonRefs'] : null);
var traverse = (typeof window !== "undefined" ? window['traverse'] : typeof global !== "undefined" ? global['traverse'] : null);
var ZSchema = (typeof window !== "undefined" ? window['ZSchema'] : typeof global !== "undefined" ? global['ZSchema'] : null);

var customJsonSchemaFormats = ['byte', 'double', 'float', 'int32', 'int64', 'mime-type', 'uri-template'];
var draft04Json = require('../schemas/json-schema-draft-04.json');
var draft04Url = 'http://json-schema.org/draft-04/schema';
var specCache = {};

module.exports.registerCustomFormats = function (json) {
  traverse(json).forEach(function () {
    var name = this.key;
    var format = this.node;

    if (name === 'format' && _.indexOf(ZSchema.getRegisteredFormats(), format) === -1) {
      ZSchema.registerFormat(format, function () {
        return true;
      });
    }
  });
};

module.exports.createJsonValidator = function (schemas) {
  var validator = new ZSchema({
    breakOnFirstError: false,
    reportPathAsArray: true
  });
  var result;

  // Add the draft-04 spec
  validator.setRemoteReference(draft04Url, draft04Json);

  // Swagger uses some unsupported/invalid formats so just make them all pass
  _.each(customJsonSchemaFormats, function (format) {
    ZSchema.registerFormat(format, function () {
      return true;
    });
  });

  // Compile and validate the schemas
  if (!_.isUndefined(schemas)) {
    result = validator.compileSchema(schemas);

    // If there is an error, it's unrecoverable so just blow the eff up
    if (result === false) {
      console.error('JSON Schema file' + (schemas.length > 1 ? 's are' : ' is') + ' invalid:');

      _.each(validator.getLastErrors(), function (err) {
        console.error('  ' + (_.isArray(err.path) ? JsonRefs.pathToPtr(err.path) : err.path) + ': ' + err.message);
      });

      throw new Error('Unable to create validator due to invalid JSON Schema');
    }
  }

  return validator;
};

module.exports.formatResults = function (results) {
  if (results) {
    // Update the results based on its content to indicate success/failure accordingly
    results = (results.errors.length + results.warnings.length +
    _.reduce(results.apiDeclarations, function (count, aResult) {
      if (aResult) {
        count += aResult.errors.length + aResult.warnings.length;
      }

      return count;
    }, 0) > 0) ? results : undefined;
  }

  return results;
};

var getErrorCount = module.exports.getErrorCount = function (results) {
  var errors = 0;

  if (results) {
    errors = results.errors.length;

    _.each(results.apiDeclarations, function (adResults) {
      if (adResults) {
        errors += adResults.errors.length;
      }
    });
  }

  return errors;
};

var coerceVersion = function (version) {
  // Convert the version to a number (Required for helpers.getSpec)
  if (version && !_.isString(version)) {
    version = version.toString();

    // Handle rounding issues (Only required for when Swagger version ends in '.0')
    if (version.indexOf('.') === -1) {
      version += '.0';
    }
  }

  return version;
};

/**
 * Returns the proper specification based on the human readable version.
 *
 * @param {string} version - The human readable Swagger version (Ex: 1.2)
 * @param {[boolean=false]} throwError - Throw an error if the version could not be identified
 *
 * @returns the corresponding Swagger Specification object or undefined if there is none
 */
module.exports.getSpec = function (version, throwError) {
  var spec;

  version = coerceVersion(version);
  spec = specCache[version];

  if (_.isUndefined(spec)) {
    switch (version) {
    case '1.2':
      spec = require('../lib/specs').v1_2; // jshint ignore:line

      break;

    case '2.0':
      spec = require('../lib/specs').v2_0; // jshint ignore:line

      break;

    default:
      if (throwError === true) {
        throw new Error('Unsupported Swagger version: ' + version);
      }
    }
  }

  return spec;
};

/**
 * Atempts to figure out the Swagger version from the Swagger document.
 *
 * @param {object} document - The Swagger document
 *
 * @returns the Swagger version or undefined if the document is not a Swagger document
 */
module.exports.getSwaggerVersion = function (document) {
  return _.isPlainObject(document) ? coerceVersion(document.swaggerVersion || document.swagger) : undefined;
};

module.exports.printValidationResults = function (version, apiDOrSO, apiDeclarations, results, printSummary) {
  var hasErrors = getErrorCount(results) > 0;
  var stream = hasErrors ? console.error : console.log;
  var pluralize = function (string, count) {
    return count === 1 ? string : string + 's';
  };
  var printErrorsOrWarnings = function (header, entries, indent) {
    if (header) {
      stream(header + ':');
      stream();
    }

    _.each(entries, function (entry) {
      stream(new Array(indent + 1).join(' ') + JsonRefs.pathToPtr(entry.path) + ': ' + entry.message);

      if (entry.inner) {
        printErrorsOrWarnings (undefined, entry.inner, indent + 2);
      }
    });

    if (header) {
      stream();
    }
  };
  var errorCount = 0;
  var warningCount = 0;

  stream();

  if (results.errors.length > 0) {
    errorCount += results.errors.length;

    printErrorsOrWarnings('API Errors', results.errors, 2);
  }

  if (results.warnings.length > 0) {
    warningCount += results.warnings.length;

    printErrorsOrWarnings('API Warnings', results.warnings, 2);
  }

  if (results.apiDeclarations) {
    results.apiDeclarations.forEach(function (adResult, index) {
      if (!adResult) {
        return;
      }

      var name = apiDeclarations[index].resourcePath || index;

      if (adResult.errors.length > 0) {
        errorCount += adResult.errors.length;

        printErrorsOrWarnings('  API Declaration (' + name + ') Errors', adResult.errors, 4);
      }

      if (adResult.warnings.length > 0) {
        warningCount += adResult.warnings.length;

        printErrorsOrWarnings('  API Declaration (' + name + ') Warnings', adResult.warnings, 4);
      }
    });
  }

  if (printSummary) {
    if (errorCount > 0) {
      stream(errorCount + ' ' + pluralize('error', errorCount) + ' and ' + warningCount + ' ' +
                    pluralize('warning', warningCount));
    } else {
      stream('Validation succeeded but with ' + warningCount + ' ' + pluralize('warning', warningCount));
    }
  }

  stream();
};

module.exports.swaggerOperationMethods = [
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT'
];

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../lib/specs":2,"../schemas/json-schema-draft-04.json":16}],2:[function(require,module,exports){
(function (global){
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = (typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null);
var async = (typeof window !== "undefined" ? window['async'] : typeof global !== "undefined" ? global['async'] : null);
var helpers = require('./helpers');
var JsonRefs = (typeof window !== "undefined" ? window['JsonRefs'] : typeof global !== "undefined" ? global['JsonRefs'] : null);
var SparkMD5 = (typeof window !== "undefined" ? window['SparkMD5'] : typeof global !== "undefined" ? global['SparkMD5'] : null);
var swaggerConverter = (typeof window !== "undefined" ? window['SwaggerConverter']['convert'] : typeof global !== "undefined" ? global['SwaggerConverter']['convert'] : null);
var traverse = (typeof window !== "undefined" ? window['traverse'] : typeof global !== "undefined" ? global['traverse'] : null);
var validators = require('./validators');
var YAML = (typeof window !== "undefined" ? window['jsyaml'] : typeof global !== "undefined" ? global['jsyaml'] : null);

// Work around swagger-converter packaging issue (Browser builds only)
if (_.isPlainObject(swaggerConverter)) {
  swaggerConverter = global.SwaggerConverter.convert;
}

var documentCache = {};

var sanitizeRef = function (version, ref) {
  return version !== '1.2' ? ref : ref.replace('#/models/', '');
};

var swagger1RefPreProcesor = function (obj) {
  var pObj = _.cloneDeep(obj);

  pObj.$ref = '#/models/' + obj.$ref;

  return pObj;
};
var validOptionNames = _.map(helpers.swaggerOperationMethods, function (method) {
  return method.toLowerCase();
});

var isRemotePtr = function (refDetails) {
  return ['relative', 'remote'].indexOf(refDetails.type) > -1;
};

var createErrorOrWarning = function (code, message, path, dest) {
  dest.push({
    code: code,
    message: message,
    path: path
  });
};

var addReference = function (cacheEntry, defPathOrPtr, refPathOrPtr, results, omitError) {
  var result = true;
  var swaggerVersion = helpers.getSwaggerVersion(cacheEntry.resolved);
  var defPath = _.isArray(defPathOrPtr) ? defPathOrPtr : JsonRefs.pathFromPtr(defPathOrPtr);
  var defPtr = _.isArray(defPathOrPtr) ? JsonRefs.pathToPtr(defPathOrPtr) : defPathOrPtr;
  var refPath = _.isArray(refPathOrPtr) ? refPathOrPtr : JsonRefs.pathFromPtr(refPathOrPtr);
  var refPtr = _.isArray(refPathOrPtr) ? JsonRefs.pathToPtr(refPathOrPtr) : refPathOrPtr;
  var code;
  var def;
  var displayId;
  var i;
  var msgPrefix;
  var type;

  def = cacheEntry.definitions[defPtr];
  type = defPath[0];
  code = type === 'securityDefinitions' ?
    'SECURITY_DEFINITION' :
    type.substring(0, type.length - 1).toUpperCase();
  displayId = swaggerVersion === '1.2' ? defPath[defPath.length - 1] : defPtr;
  msgPrefix = type === 'securityDefinitions' ?
    'Security definition' :
    code.charAt(0) + code.substring(1).toLowerCase();

  // This is an authorization scope reference
  if (['authorizations', 'securityDefinitions'].indexOf(defPath[0]) > -1 && defPath[2] === 'scopes') {
    code += '_SCOPE';
    msgPrefix += ' scope';
  }

  // If the reference was not found and this is not an authorization/security scope reference, attempt to find a
  // parent object to add the reference too.  (Issue 176)
  if (_.isUndefined(def) && ['AUTHORIZATION_SCOPE', 'SECURITY_DEFINITION_SCOPE'].indexOf(code) === -1) {
    // Attempt to find the definition in case the reference is to a path within a definition`
    for (i = 1; i < defPath.length; i++) {
      var pPath = defPath.slice(0, defPath.length - i);
      var pPtr = JsonRefs.pathToPtr(pPath);
      var pDef = cacheEntry.definitions[pPtr];

      if (!_.isUndefined(pDef)) {
        def = pDef;

        break;
      }
    }
  }

  if (_.isUndefined(def)) {
    if (!omitError) {
      if (cacheEntry.swaggerVersion !== '1.2' && ['SECURITY_DEFINITION', 'SECURITY_DEFINITION_SCOPE'].indexOf(code) === -1) {
        refPath.push('$ref');
      }

      createErrorOrWarning('UNRESOLVABLE_' + code, msgPrefix + ' could not be resolved: ' + displayId, refPath,
                           results.errors);
    }

    result = false;
  } else {
    if (_.isUndefined(def.references)) {
      def.references = [];
    }

    def.references.push(refPtr);
  }

  return result;
};

var getOrComposeSchema = function (documentMetadata, modelId) {
  var title = 'Composed ' + (documentMetadata.swaggerVersion === '1.2' ?
                               JsonRefs.pathFromPtr(modelId).pop() :
                               modelId);
  var metadata = documentMetadata.definitions[modelId];
  var originalT = traverse(documentMetadata.original);
  var resolvedT = traverse(documentMetadata.resolved);
  var composed;
  var original;

  if (!metadata) {
    return undefined;
  }

  original = _.cloneDeep(originalT.get(JsonRefs.pathFromPtr(modelId)));
  composed = _.cloneDeep(resolvedT.get(JsonRefs.pathFromPtr(modelId)));

  // Convert the Swagger 1.2 document to a valid JSON Schema file
  if (documentMetadata.swaggerVersion === '1.2') {
    // Create inheritance model
    if (metadata.lineage.length > 0) {
      composed.allOf = [];

      _.each(metadata.lineage, function (modelId) {
        composed.allOf.push(getOrComposeSchema(documentMetadata, modelId));
      });
    }

    // Remove the subTypes property
    delete composed.subTypes;

    _.each(composed.properties, function (property, name) {
      var oProp = original.properties[name];

      // Convert the string values to numerical values
      _.each(['maximum', 'minimum'], function (prop) {
        if (_.isString(property[prop])) {
          property[prop] = parseFloat(property[prop]);
        }
      });

      _.each(JsonRefs.findRefs(oProp, {
        includeInvalid: true,
        refPreProcessor: swagger1RefPreProcesor
      }), function (refDetails, refPtr) {
        var dMetadata = documentMetadata.definitions[refDetails.uri];
        var path = JsonRefs.pathFromPtr(refPtr);

        if (dMetadata.lineage.length > 0) {
          traverse(property).set(path, getOrComposeSchema(documentMetadata, refDetails.uri));
        } else {
          traverse(property).set(path.concat('title'), 'Composed ' + sanitizeRef(documentMetadata.swaggerVersion,
                                                                                 refDetails.uri));
        }
      });
    });
  }

  // Scrub id properties
  composed = traverse(composed).map(function (val) {
    if (this.key === 'id' && _.isString(val)) {
      this.remove();
    }
  });

  composed.title = title;

  return composed;
};

var createUnusedErrorOrWarning = function (val, codeSuffix, msgPrefix, path, dest) {
  createErrorOrWarning('UNUSED_' + codeSuffix, msgPrefix + ' is defined but is not used: ' + val, path, dest);
};

var getDocumentCache = function (apiDOrSO) {
  var key = SparkMD5.hash(JSON.stringify(apiDOrSO));
  var cacheEntry = documentCache[key] || _.find(documentCache, function (cacheEntry) {
    return cacheEntry.resolvedId === key;
  });

  if (!cacheEntry) {
    cacheEntry = documentCache[key] = {
      definitions: {},
      original: apiDOrSO,
      resolved: undefined,
      swaggerVersion: helpers.getSwaggerVersion(apiDOrSO)
    };
  }

  return cacheEntry;
};

var handleValidationError = function (results, callback) {
  var err = new Error('The Swagger document(s) are invalid');

  err.errors = results.errors;
  err.failedValidation = true;
  err.warnings = results.warnings;

  if (results.apiDeclarations) {
    err.apiDeclarations = results.apiDeclarations;
  }

  callback(err);
};

var normalizePath = function (path) {
  var matches = path.match(/\{(.*?)\}/g);
  var argNames = [];
  var normPath = path;

  if (matches) {
    _.each(matches, function (match, index) {
      normPath = normPath.replace(match, '{' + index + '}');
      argNames.push(match.replace(/[{}]/g, ''));
    });
  }

  return {
    path: normPath,
    args: argNames
  };
};

var removeCirculars = function (obj) {
  function walk (ancestors, node, path) {
    function walkItem (item, segment) {
      path.push(segment);
      walk(ancestors, item, path);
      path.pop();
    }

    // We do not process circular objects again
    if (ancestors.indexOf(node) === -1) {
      ancestors.push(node);

      if (_.isArray(node)) {
        _.each(node, function (member, index) {
          walkItem(member, index.toString());
        });
      } else if (_.isPlainObject(node)) {
        _.forOwn(node, function (member, key) {
          walkItem(member, key.toString());
        });
      }
    } else {
      _.set(obj, path, {});
    }

    ancestors.pop();
  }

  walk([], obj, []);
};


var validateNoExist = function (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) > -1) {
    createErrorOrWarning('DUPLICATE_' + codeSuffix, msgPrefix + ' already defined: ' + val, path, dest);
  }
};

var validateSchemaConstraints = function (documentMetadata, schema, path, results, skip) {
  try {
    validators.validateSchemaConstraints(documentMetadata.swaggerVersion, schema, path, undefined);
  } catch (err) {
    if (!skip) {
      createErrorOrWarning(err.code, err.message, err.path, results.errors);
    }
  }
};

var processDocument = function (documentMetadata, results) {
  var swaggerVersion = documentMetadata.swaggerVersion;
  var getDefinitionMetadata = function (defPath, inline) {
    var defPtr = JsonRefs.pathToPtr(defPath);
    var metadata = documentMetadata.definitions[defPtr];

    if (!metadata) {
      metadata = documentMetadata.definitions[defPtr] = {
        inline: inline || false,
        references: []
      };

      // For model definitions, add the inheritance properties
      if (['definitions', 'models'].indexOf(JsonRefs.pathFromPtr(defPtr)[0]) > -1) {
        metadata.cyclical = false;
        metadata.lineage = undefined;
        metadata.parents = [];
      }
    }

    return metadata;
  };
  var getDisplayId = function (id) {
    return swaggerVersion === '1.2' ? JsonRefs.pathFromPtr(id).pop() : id;
  };
  var jsonRefsOptions = {
    filter: 'local',
    includeInvalid: true
  };
  var walk = function (root, id, lineage) {
    var definition = documentMetadata.definitions[id || root];

    if (definition) {
      _.each(definition.parents, function (parent) {
        lineage.push(parent);

        if (root !== parent) {
          walk(root, parent, lineage);
        }
      });
    }
  };
  var authDefsProp = swaggerVersion === '1.2' ? 'authorizations' : 'securityDefinitions';
  var modelDefsProp = swaggerVersion === '1.2' ? 'models' : 'definitions';

  // Process authorization definitions
  _.each(documentMetadata.resolved[authDefsProp], function (authorization, name) {
    var securityDefPath = [authDefsProp, name];

    // Swagger 1.2 only has authorization definitions in the Resource Listing
    if (swaggerVersion === '1.2' && !authorization.type) {
      return;
    }

    // Create the authorization definition metadata
    getDefinitionMetadata(securityDefPath);

    _.reduce(authorization.scopes, function (seenScopes, scope, indexOrName) {
      var scopeName = swaggerVersion === '1.2' ? scope.scope : indexOrName;
      var scopeDefPath = securityDefPath.concat(['scopes', indexOrName.toString()]);
      var scopeMetadata = getDefinitionMetadata(securityDefPath.concat(['scopes', scopeName]));

      scopeMetadata.scopePath = scopeDefPath;

      // Identify duplicate authorization scope defined in the Resource Listing
      validateNoExist(seenScopes, scopeName, 'AUTHORIZATION_SCOPE_DEFINITION', 'Authorization scope definition',
                      swaggerVersion === '1.2' ? scopeDefPath.concat('scope') : scopeDefPath, results.warnings);

      seenScopes.push(scopeName);

      return seenScopes;
    }, []);
  });

  // Process model definitions
  _.each(documentMetadata.resolved[modelDefsProp], function (model, modelId) {
    var modelDefPath = [modelDefsProp, modelId];
    var modelMetadata = getDefinitionMetadata(modelDefPath);

    // Identify model id mismatch (Id in models object is not the same as the model's id in the models object)
    if (swaggerVersion === '1.2' && modelId !== model.id) {
      createErrorOrWarning('MODEL_ID_MISMATCH', 'Model id does not match id in models object: ' + model.id,
                           modelDefPath.concat('id'), results.errors);
    }

    // Do not reprocess parents/references if already processed
    if (_.isUndefined(modelMetadata.lineage)) {
      // Handle inheritance references
      switch (swaggerVersion) {
      case '1.2':
        _.each(model.subTypes, function (subType, index) {
          var subPath = ['models', subType];
          var subPtr = JsonRefs.pathToPtr(subPath);
          var subMetadata = documentMetadata.definitions[subPtr];
          var refPath = modelDefPath.concat(['subTypes', index.toString()]);

          // If the metadata does not yet exist, create it
          if (!subMetadata && documentMetadata.resolved[modelDefsProp][subType]) {
            subMetadata = getDefinitionMetadata(subPath);
          }

          // If the reference is valid, add the parent
          if (addReference(documentMetadata, subPath, refPath, results)) {
            subMetadata.parents.push(JsonRefs.pathToPtr(modelDefPath));
          }
        });

        break;

      default:
        _.each(documentMetadata.original[modelDefsProp][modelId].allOf, function (schema, index) {
          var isInline = false;
          var parentPath;

          if (_.isUndefined(schema.$ref) || isRemotePtr(JsonRefs.getRefDetails(schema))) {
            isInline = true;
            parentPath = modelDefPath.concat(['allOf', index.toString()]);
          } else {
            parentPath = JsonRefs.pathFromPtr(schema.$ref);
          }

          // If the parent model does not exist, do not create its metadata
          if (!_.isUndefined(traverse(documentMetadata.resolved).get(parentPath))) {
            // Create metadata for parent
            getDefinitionMetadata(parentPath, isInline);

            modelMetadata.parents.push(JsonRefs.pathToPtr(parentPath));
          }
        });

        break;
      }
    }
  });

  switch (swaggerVersion) {
  case '2.0':
    // Process parameter definitions
    _.each(documentMetadata.resolved.parameters, function (parameter, name) {
      var path = ['parameters', name];

      getDefinitionMetadata(path);

      validateSchemaConstraints(documentMetadata, parameter, path, results);
    });

    // Process response definitions
    _.each(documentMetadata.resolved.responses, function (response, name) {
      var path = ['responses', name];

      getDefinitionMetadata(path);

      validateSchemaConstraints(documentMetadata, response, path, results);
    });

    break;
  }

  // Validate definition/models (Inheritance, property definitions, ...)
  _.each(documentMetadata.definitions, function (metadata, id) {
    var defPath = JsonRefs.pathFromPtr(id);
    var definition = traverse(documentMetadata.original).get(defPath);
    var defProp = defPath[0];
    var code = defProp.substring(0, defProp.length - 1).toUpperCase();
    var msgPrefix = code.charAt(0) + code.substring(1).toLowerCase();
    var dProperties;
    var iProperties;
    var lineage;

    // The only checks we perform below are inheritance checks so skip all non-model definitions
    if (['definitions', 'models'].indexOf(defProp) === -1) {
      return;
    }

    dProperties = [];
    iProperties = [];
    lineage = metadata.lineage;

    // Do not reprocess lineage if already processed
    if (_.isUndefined(lineage)) {
      lineage = [];

      walk(id, undefined, lineage);

      // Root > next > ...
      lineage.reverse();

      metadata.lineage = _.cloneDeep(lineage);

      metadata.cyclical = lineage.length > 1 && lineage[0] === id;
    }

    // Swagger 1.2 does not allow multiple inheritance while Swagger 2.0+ does
    if (metadata.parents.length > 1 && swaggerVersion === '1.2') {
      createErrorOrWarning('MULTIPLE_' + code + '_INHERITANCE',
                           'Child ' + code.toLowerCase() + ' is sub type of multiple models: ' +
                           _.map(metadata.parents, function (parent) {
                             return getDisplayId(parent);
                           }).join(' && '), defPath, results.errors);
    }

    if (metadata.cyclical) {
      createErrorOrWarning('CYCLICAL_' + code + '_INHERITANCE',
                           msgPrefix + ' has a circular inheritance: ' +
                             _.map(lineage, function (dep) {
                               return getDisplayId(dep);
                             }).join(' -> ') + ' -> ' + getDisplayId(id),
                            defPath.concat(swaggerVersion === '1.2' ? 'subTypes' : 'allOf'), results.errors);
    }

    // Remove self reference from the end of the lineage (Front too if cyclical)
    _.each(lineage.slice(metadata.cyclical ? 1 : 0), function (id) {
      var pModel = traverse(documentMetadata.resolved).get(JsonRefs.pathFromPtr(id));

      _.each(Object.keys(pModel.properties || {}), function (name) {
        if (iProperties.indexOf(name) === -1) {
          iProperties.push(name);
        }
      });
    });

    // Validate simple definitions
    validateSchemaConstraints(documentMetadata, definition, defPath, results);

    // Identify redeclared properties
    _.each(definition.properties, function (property, name) {
      var pPath = defPath.concat(['properties', name]);

      // Do not process unresolved properties
      if (!_.isUndefined(property)) {
        validateSchemaConstraints(documentMetadata, property, pPath, results);

        if (iProperties.indexOf(name) > -1) {
          createErrorOrWarning('CHILD_' + code + '_REDECLARES_PROPERTY',
                               'Child ' + code.toLowerCase() + ' declares property already declared by ancestor: ' +
                               name,
                               pPath, results.errors);
        } else {
          dProperties.push(name);
        }
      }
    });

    // Identify missing required properties
    _.each(definition.required || [], function (name, index) {
      var type = swaggerVersion === '1.2' ? 'Model' : 'Definition';

      if (iProperties.indexOf(name) === -1 && dProperties.indexOf(name) === -1) {
        createErrorOrWarning('MISSING_REQUIRED_' + type.toUpperCase() + '_PROPERTY',
                             type + ' requires property but it is not defined: ' + name,
                             defPath.concat(['required', index.toString()]), results.errors);
      }
    });
  });

  if (documentMetadata.swaggerVersion === '1.2') {
    jsonRefsOptions.refPreProcessor = swagger1RefPreProcesor;
  }

  // Process local references
  _.each(JsonRefs.findRefs(documentMetadata.original, jsonRefsOptions), function (refDetails, refPtr) {
    addReference(documentMetadata, refDetails.uri, refPtr, results);
  });

  // Process invalid references
  _.each(documentMetadata.referencesMetadata, function (refDetails, refPtr) {
    if (isRemotePtr(refDetails) && refDetails.missing === true) {
      results.errors.push({
        code: 'UNRESOLVABLE_REFERENCE',
        message: 'Reference could not be resolved: ' + sanitizeRef(documentMetadata.swaggerVersion, refDetails.uri),
        path: JsonRefs.pathFromPtr(refPtr).concat('$ref')
      });
    }
  });
};

var validateExist = function (data, val, codeSuffix, msgPrefix, path, dest) {
  if (!_.isUndefined(data) && data.indexOf(val) === -1) {
    createErrorOrWarning('UNRESOLVABLE_' + codeSuffix, msgPrefix + ' could not be resolved: ' + val, path, dest);
  }
};

var processAuthRefs = function (documentMetadata, authRefs, path, results) {
  var code = documentMetadata.swaggerVersion === '1.2' ? 'AUTHORIZATION' : 'SECURITY_DEFINITION';
  var msgPrefix = code === 'AUTHORIZATION' ? 'Authorization' : 'Security definition';

  if (documentMetadata.swaggerVersion === '1.2') {
    _.reduce(authRefs, function (seenNames, scopes, name) {
      var authPtr = ['authorizations', name];
      var aPath = path.concat([name]);

      // Add reference or record unresolved authorization
      if (addReference(documentMetadata, authPtr, aPath, results)) {
        _.reduce(scopes, function (seenScopes, scope, index) {
          var sPath = aPath.concat(index.toString(), 'scope');
          var sPtr = authPtr.concat(['scopes', scope.scope]);

          validateNoExist(seenScopes, scope.scope, code + '_SCOPE_REFERENCE', msgPrefix + ' scope reference', sPath,
                          results.warnings);

          // Add reference or record unresolved authorization scope
          addReference(documentMetadata, sPtr, sPath, results);

          return seenScopes.concat(scope.scope);
        }, []);
      }

      return seenNames.concat(name);
    }, []);
  } else {
    _.reduce(authRefs, function (seenNames, scopes, index) {
      _.each(scopes, function (scopes, name) {
        var authPtr = ['securityDefinitions', name];
        var authRefPath = path.concat(index.toString(), name);

        // Ensure the security definition isn't referenced more than once (Swagger 2.0+)
        validateNoExist(seenNames, name, code + '_REFERENCE', msgPrefix + ' reference', authRefPath,
                        results.warnings);

        seenNames.push(name);

        // Add reference or record unresolved authorization
        if (addReference(documentMetadata, authPtr, authRefPath, results)) {
          _.each(scopes, function (scope, index) {
            // Add reference or record unresolved authorization scope
            var sPtr = authPtr.concat(['scopes', scope]);
            addReference(documentMetadata, sPtr, authRefPath.concat(index.toString()),
                         results);
          });
        }
      });

      return seenNames;
    }, []);
  }
};

var resolveRefs = function (apiDOrSO, callback) {
  var cacheEntry = getDocumentCache(apiDOrSO);
  var swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  var jsonRefsOptions = {
    includeInvalid: true,
    loaderOptions: {
      processContent: function (res, callback) {
        callback(undefined, YAML.safeLoad(res.text));
      }
    }
  };

  if (!cacheEntry.resolved) {
    // For Swagger 1.2, we have to create real JSON References
    if (swaggerVersion === '1.2') {
      jsonRefsOptions.refPreProcessor = swagger1RefPreProcesor;
    }

    // Resolve references
    JsonRefs.resolveRefs(apiDOrSO, jsonRefsOptions)
      .then(function (results) {
        removeCirculars(results.resolved);

        // Fix circular references
        _.each(results.refs, function (refDetails, refPtr) {
          if (refDetails.circular) {
            _.set(results.resolved, JsonRefs.pathFromPtr(refPtr), {});
          }
        });

        cacheEntry.referencesMetadata = results.refs;
        cacheEntry.resolved = results.resolved;
        cacheEntry.resolvedId = SparkMD5.hash(JSON.stringify(results.resolved));

        callback();
      })
      .catch(callback);
  } else {
    callback();
  }
};

var validateAgainstSchema = function (spec, schemaOrName, data, callback) {
  var validator = _.isString(schemaOrName) ? spec.validators[schemaOrName] : helpers.createJsonValidator();

  helpers.registerCustomFormats(data);

  try {
    validators.validateAgainstSchema(schemaOrName, data, validator);
  } catch (err) {
    if (err.failedValidation) {
      return callback(undefined, err.results);
    } else {
      return callback(err);
    }
  }

  resolveRefs(data, function (err) {
    return callback(err);
  });
};

var validateDefinitions = function (documentMetadata, results) {
  // Validate unused definitions
  _.each(documentMetadata.definitions, function (metadata, id) {
    var defPath = JsonRefs.pathFromPtr(id);
    var defType = defPath[0].substring(0, defPath[0].length - 1);
    var displayId = documentMetadata.swaggerVersion === '1.2' ? defPath[defPath.length - 1] : id;
    var code = defType === 'securityDefinition' ? 'SECURITY_DEFINITION' : defType.toUpperCase();
    var msgPrefix = defType === 'securityDefinition' ?
                             'Security definition' :
                             defType.charAt(0).toUpperCase() + defType.substring(1);

    if (metadata.references.length === 0 && !metadata.inline) {
      // Swagger 1.2 authorization scope
      if (metadata.scopePath) {
        code += '_SCOPE';
        msgPrefix += ' scope';
        defPath = metadata.scopePath;
      }

      createUnusedErrorOrWarning(displayId, code, msgPrefix, defPath, results.warnings);
    }
  });
};

var validateParameters = function (spec, documentMetadata, nPath, parameters, path, results,
                                   skipMissing) {
  var createParameterComboError = function (path) {
    createErrorOrWarning('INVALID_PARAMETER_COMBINATION',
                         'API cannot have a a body parameter and a ' +
                           (spec.version === '1.2' ? 'form' : 'formData') + ' parameter',
                         path, results.errors);
  };
  var pathParams = [];
  var seenBodyParam = false;
  var seenFormParam = false;

  _.reduce(parameters, function (seenParameters, parameter, index) {
    var pPath = path.concat(['parameters', index.toString()]);

    // Unresolved parameter
    if (_.isUndefined(parameter)) {
      return;
    }

    // Identify duplicate parameter names
    validateNoExist(seenParameters, parameter.name, 'PARAMETER', 'Parameter', pPath.concat('name'),
                    results.errors);

    // Keep track of body and path parameters
    if (parameter.paramType === 'body' || parameter.in === 'body') {
      if (seenBodyParam === true) {
        createErrorOrWarning('DUPLICATE_API_BODY_PARAMETER', 'API has more than one body parameter', pPath,
                             results.errors);
      } else if (seenFormParam === true) {
        createParameterComboError(pPath);
      }

      seenBodyParam = true;
    } else if (parameter.paramType === 'form' || parameter.in === 'formData') {
      if (seenBodyParam === true) {
        createParameterComboError(pPath);
      }

      seenFormParam = true;
    } else if (parameter.paramType === 'path' || parameter.in === 'path') {
      if (nPath.args.indexOf(parameter.name) === -1) {
        createErrorOrWarning('UNRESOLVABLE_API_PATH_PARAMETER',
                             'API path parameter could not be resolved: ' + parameter.name, pPath.concat('name'),
                             results.errors);
      }

      pathParams.push(parameter.name);
    }

    if (spec.primitives.indexOf(parameter.type) === -1 && spec.version === '1.2') {
      addReference(documentMetadata, '#/models/' + parameter.type, pPath.concat('type'), results);
    }

    // Validate parameter constraints
    validateSchemaConstraints(documentMetadata, parameter, pPath, results, parameter.skipErrors);

    return seenParameters.concat(parameter.name);
  }, []);

  // Validate missing path parameters (in path but not in operation.parameters)
  if (_.isUndefined(skipMissing) || skipMissing === false) {
    _.each(_.difference(nPath.args, pathParams), function (unused) {
      createErrorOrWarning('MISSING_API_PATH_PARAMETER', 'API requires path parameter but it is not defined: ' + unused,
                           documentMetadata.swaggerVersion === '1.2' ? path.slice(0, 2).concat('path') : path,
                           results.errors);
    });
  }
};

var validateSwagger1_2 = function (spec, resourceListing, apiDeclarations, callback) { // jshint ignore:line
  var adResourcePaths = [];
  var rlDocumentMetadata = getDocumentCache(resourceListing);
  var rlResourcePaths = [];
  var results = {
    errors: [],
    warnings: [],
    apiDeclarations: []
  };

  // Process Resource Listing resource definitions
  rlResourcePaths = _.reduce(resourceListing.apis, function (seenPaths, api, index) {
    // Identify duplicate resource paths defined in the Resource Listing
    validateNoExist(seenPaths, api.path, 'RESOURCE_PATH', 'Resource path', ['apis', index.toString(), 'path'],
                    results.errors);

    seenPaths.push(api.path);

    return seenPaths;
  }, []);

  // Process Resource Listing definitions (authorizations)
  processDocument(rlDocumentMetadata, results);


  // Process each API Declaration
  adResourcePaths = _.reduce(apiDeclarations, function (seenResourcePaths, apiDeclaration, index) {
    var aResults = results.apiDeclarations[index] = {
      errors: [],
      warnings: []
    };
    var adDocumentMetadata = getDocumentCache(apiDeclaration);

    // Identify duplicate resource paths defined in the API Declarations
    validateNoExist(seenResourcePaths, apiDeclaration.resourcePath, 'RESOURCE_PATH', 'Resource path',
                    ['resourcePath'], aResults.errors);

    if (adResourcePaths.indexOf(apiDeclaration.resourcePath) === -1) {
      // Identify unused resource paths defined in the API Declarations
      validateExist(rlResourcePaths, apiDeclaration.resourcePath, 'RESOURCE_PATH', 'Resource path',
                    ['resourcePath'], aResults.errors);

      seenResourcePaths.push(apiDeclaration.resourcePath);
    }

    // TODO: Process authorization references
    // Not possible due to https://github.com/swagger-api/swagger-spec/issues/159

    // Process models
    processDocument(adDocumentMetadata, aResults);

    // Process the API definitions
    _.reduce(apiDeclaration.apis, function (seenPaths, api, index) {
      var aPath = ['apis', index.toString()];
      var nPath = normalizePath(api.path);

      // Validate duplicate resource path
      if (seenPaths.indexOf(nPath.path) > -1) {
        createErrorOrWarning('DUPLICATE_API_PATH', 'API path (or equivalent) already defined: ' + api.path,
                             aPath.concat('path'), aResults.errors);
      } else {
        seenPaths.push(nPath.path);
      }

      // Process the API operations
      _.reduce(api.operations, function (seenMethods, operation, index) {
        var oPath = aPath.concat(['operations', index.toString()]);

        // Validate duplicate operation method
        validateNoExist(seenMethods, operation.method, 'OPERATION_METHOD', 'Operation method', oPath.concat('method'),
                        aResults.errors);

        // Keep track of the seen methods
        seenMethods.push(operation.method);

        // Keep track of operation types
        if (spec.primitives.indexOf(operation.type) === -1 && spec.version === '1.2') {
          addReference(adDocumentMetadata, '#/models/' + operation.type, oPath.concat('type'), aResults);
        }

        // Process authorization references
        processAuthRefs(rlDocumentMetadata, operation.authorizations, oPath.concat('authorizations'), aResults);

        // Validate validate inline constraints
        validateSchemaConstraints(adDocumentMetadata, operation, oPath, aResults);

        // Validate parameters
        validateParameters(spec, adDocumentMetadata, nPath, operation.parameters, oPath, aResults);

        // Validate unique response code
        _.reduce(operation.responseMessages, function (seenResponseCodes, responseMessage, index) {
          var rmPath = oPath.concat(['responseMessages', index.toString()]);

          validateNoExist(seenResponseCodes, responseMessage.code, 'RESPONSE_MESSAGE_CODE', 'Response message code',
                          rmPath.concat(['code']), aResults.errors);

          // Validate missing model
          if (responseMessage.responseModel) {
            addReference(adDocumentMetadata, '#/models/' + responseMessage.responseModel,
                         rmPath.concat('responseModel'), aResults);
          }

          return seenResponseCodes.concat(responseMessage.code);
        }, []);

        return seenMethods;
      }, []);

      return seenPaths;
    }, []);

    // Validate API Declaration definitions
    validateDefinitions(adDocumentMetadata, aResults);

    return seenResourcePaths;
  }, []);

  // Validate API Declaration definitions
  validateDefinitions(rlDocumentMetadata, results);

  // Identify unused resource paths defined in the Resource Listing
  _.each(_.difference(rlResourcePaths, adResourcePaths), function (unused) {
    var index = rlResourcePaths.indexOf(unused);

    createUnusedErrorOrWarning(resourceListing.apis[index].path, 'RESOURCE_PATH', 'Resource path',
                               ['apis', index.toString(), 'path'], results.errors);
  });

  callback(undefined, results);
};

var validateSwagger2_0 = function (spec, swaggerObject, callback) { // jshint ignore:line
  var documentMetadata = getDocumentCache(swaggerObject);
  var results = {
    errors: [],
    warnings: []
  };

  // Process definitions
  processDocument(documentMetadata, results);

  // Process security references
  processAuthRefs(documentMetadata, swaggerObject.security, ['security'], results);

  _.reduce(documentMetadata.resolved.paths, function (seenPaths, path, name) {
    var pPath = ['paths', name];
    var nPath = normalizePath(name);

    // Validate duplicate resource path
    if (seenPaths.indexOf(nPath.path) > -1) {
      createErrorOrWarning('DUPLICATE_API_PATH', 'API path (or equivalent) already defined: ' + name, pPath,
                           results.errors);
    }

    // Validate parameters
    validateParameters(spec, documentMetadata, nPath, path.parameters, pPath, results, true);

    // Validate the Operations
    _.each(path, function (operation, method) {
      var cParams = [];
      var oPath = pPath.concat(method);
      var seenParams = [];

      if (validOptionNames.indexOf(method) === -1) {
        return;
      }

      // Process security references
      processAuthRefs(documentMetadata, operation.security, oPath.concat('security'), results);

      // Compose parameters from path global parameters and operation parameters
      _.each(operation.parameters, function (parameter) {
        // Can happen with invalid references
        if (_.isUndefined(parameter)) {
          return;
        }

        cParams.push(parameter);

        seenParams.push(parameter.name + ':' + parameter.in);
      });

      _.each(path.parameters, function (parameter) {
        var cloned = _.cloneDeep(parameter);

        // The only errors that can occur here are schema constraint validation errors which are already reported above
        // so do not report them again.
        cloned.skipErrors = true;

        if (seenParams.indexOf(parameter.name + ':' + parameter.in) === -1) {
          cParams.push(cloned);
        }
      });

      // Validate parameters
      validateParameters(spec, documentMetadata, nPath, cParams, oPath, results);

      // Validate responses
      _.each(operation.responses, function (response, responseCode) {
        // Do not process references to missing responses
        if (!_.isUndefined(response)) {
          // Validate validate inline constraints
          validateSchemaConstraints(documentMetadata, response, oPath.concat('responses', responseCode), results);
        }
      });
    });

    return seenPaths.concat(nPath.path);
  }, []);

  // Validate definitions
  validateDefinitions(documentMetadata, results);

  callback(undefined, results);
};

var validateSemantically = function (spec, rlOrSO, apiDeclarations, callback) {
  var cbWrapper = function (err, results) {
    callback(err, helpers.formatResults(results));
  };
  if (spec.version === '1.2') {
    validateSwagger1_2(spec, rlOrSO, apiDeclarations, cbWrapper); // jshint ignore:line
  } else {
    validateSwagger2_0(spec, rlOrSO, cbWrapper); // jshint ignore:line
  }
};

var validateStructurally = function (spec, rlOrSO, apiDeclarations, callback) {
  validateAgainstSchema(spec, spec.version === '1.2' ? 'resourceListing.json' : 'schema.json', rlOrSO,
                        function (err, results) {
                          if (err) {
                            return callback(err);
                          }

                          // Only validate the API Declarations if the API is 1.2 and the Resource Listing was valid
                          if (!results && spec.version === '1.2') {
                            results = {
                              errors: [],
                              warnings: [],
                              apiDeclarations: []
                            };

                            async.map(apiDeclarations, function (apiDeclaration, callback2) {
                              validateAgainstSchema(spec, 'apiDeclaration.json', apiDeclaration, callback2);
                            }, function (err, allResults) {
                              if (err) {
                                return callback(err);
                              }

                              _.each(allResults, function (result, index) {
                                results.apiDeclarations[index] = result;
                              });

                              callback(undefined, results);
                            });
                          } else {
                            callback(undefined, results);
                          }
                        });
};

/**
 * Creates a new Swagger specification object.
 *
 * @param {string} version - The Swagger version
 *
 * @constructor
 */
var Specification = function (version) {
  var that = this;
  var createValidators = function (spec, validatorsMap) {
    return _.reduce(validatorsMap, function (result, schemas, schemaName) {
      result[schemaName] = helpers.createJsonValidator(schemas);

      return result;
    }, {});
  };
  var fixSchemaId = function (schemaName) {
    // Swagger 1.2 schema files use one id but use a different id when referencing schema files.  We also use the schema
    // file name to reference the schema in ZSchema.  To fix this so that the JSON Schema validator works properly, we
    // need to set the id to be the name of the schema file.
    var fixed = _.cloneDeep(that.schemas[schemaName]);

    fixed.id = schemaName;

    return fixed;
  };
  var primitives = ['string', 'number', 'boolean', 'integer', 'array'];

  switch (version) {
  case '1.2':
    this.docsUrl = 'https://github.com/swagger-api/swagger-spec/blob/master/versions/1.2.md';
    this.primitives = _.union(primitives, ['void', 'File']);
    this.schemasUrl = 'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v1.2';

    // Here explicitly to allow browserify to work
    this.schemas = {
      'apiDeclaration.json': require('../schemas/1.2/apiDeclaration.json'),
      'authorizationObject.json': require('../schemas/1.2/authorizationObject.json'),
      'dataType.json': require('../schemas/1.2/dataType.json'),
      'dataTypeBase.json': require('../schemas/1.2/dataTypeBase.json'),
      'infoObject.json': require('../schemas/1.2/infoObject.json'),
      'modelsObject.json': require('../schemas/1.2/modelsObject.json'),
      'oauth2GrantType.json': require('../schemas/1.2/oauth2GrantType.json'),
      'operationObject.json': require('../schemas/1.2/operationObject.json'),
      'parameterObject.json': require('../schemas/1.2/parameterObject.json'),
      'resourceListing.json': require('../schemas/1.2/resourceListing.json'),
      'resourceObject.json': require('../schemas/1.2/resourceObject.json')
    };

    this.validators = createValidators(this, {
      'apiDeclaration.json': _.map([
        'dataTypeBase.json',
        'modelsObject.json',
        'oauth2GrantType.json',
        'authorizationObject.json',
        'parameterObject.json',
        'operationObject.json',
        'apiDeclaration.json'
      ], fixSchemaId),
      'resourceListing.json': _.map([
        'resourceObject.json',
        'infoObject.json',
        'oauth2GrantType.json',
        'authorizationObject.json',
        'resourceListing.json'
      ], fixSchemaId)
    });

    break;

  case '2.0':
    this.docsUrl = 'https://github.com/swagger-api/swagger-spec/blob/master/versions/2.0.md';
    this.primitives = _.union(primitives, ['file']);
    this.schemasUrl = 'https://github.com/swagger-api/swagger-spec/tree/master/schemas/v2.0';

    // Here explicitly to allow browserify to work
    this.schemas = {
      'schema.json': require('../schemas/2.0/schema.json')
    };

    this.validators = createValidators(this, {
      'schema.json': [fixSchemaId('schema.json')]
    });

    break;

  default:
    throw new Error(version + ' is an unsupported Swagger specification version');
  }

  this.version = version;
};

/**
 * Returns the result of the validation of the Swagger document(s).
 *
 * @param {object} rlOrSO - The Swagger Resource Listing (1.2) or Swagger Object (2.0)
 * @param {object[]} [apiDeclarations] - The array of Swagger API Declarations (1.2)
 * @param {resultCallback} callback - The result callback
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 * @throws Error if the arguments provided are not valid
 */
Specification.prototype.validate = function (rlOrSO, apiDeclarations, callback) {
  // Validate arguments
  switch (this.version) {
  case '1.2':
    // Validate arguments
    if (_.isUndefined(rlOrSO)) {
      throw new Error('resourceListing is required');
    } else if (!_.isPlainObject(rlOrSO)) {
      throw new TypeError('resourceListing must be an object');
    }

    if (_.isUndefined(apiDeclarations)) {
      throw new Error('apiDeclarations is required');
    } else if (!_.isArray(apiDeclarations)) {
      throw new TypeError('apiDeclarations must be an array');
    }

    break;

  case '2.0':
    // Validate arguments
    if (_.isUndefined(rlOrSO)) {
      throw new Error('swaggerObject is required');
    } else if (!_.isPlainObject(rlOrSO)) {
      throw new TypeError('swaggerObject must be an object');
    }

    break;
  }

  if (this.version === '2.0') {
    callback = arguments[1];
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  // For Swagger 2.0, make sure apiDeclarations is an empty array
  if (this.version === '2.0') {
    apiDeclarations = [];
  }

  var that = this;

  // Perform the validation
  validateStructurally(this, rlOrSO, apiDeclarations, function (err, result) {
    if (err || helpers.formatResults(result)) {
      callback(err, result);
    } else {
      validateSemantically(that, rlOrSO, apiDeclarations, callback);
    }
  });
};

/**
 * Returns a JSON Schema representation of a composed model based on its id or reference.
 *
 * Note: For Swagger 1.2, we only perform structural validation prior to composing the model.
 *
 * @param {object} apiDOrSO - The Swagger Resource API Declaration (1.2) or the Swagger Object (2.0)
 * @param {string} modelIdOrRef - The model id (1.2) or the reference to the model (1.2 or 2.0)
 * @param {resultCallback} callback - The result callback
 *
 * @returns the object representing a composed object
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.composeModel = function (apiDOrSO, modelIdOrRef, callback) {
  var swaggerVersion = helpers.getSwaggerVersion(apiDOrSO);
  var doComposition = function (err, results) {
    var documentMetadata;

    if (err) {
      return callback(err);
    } else if (helpers.getErrorCount(results) > 0) {
      return handleValidationError(results, callback);
    }

    documentMetadata = getDocumentCache(apiDOrSO);
    results = {
      errors: [],
      warnings: []
    };

    processDocument(documentMetadata, results);

    if (!documentMetadata.definitions[modelIdOrRef]) {
      return callback();
    }

    if (helpers.getErrorCount(results) > 0) {
      return handleValidationError(results, callback);
    }

    callback(undefined, getOrComposeSchema(documentMetadata, modelIdOrRef));
  };

  switch (this.version) {
  case '1.2':
    // Validate arguments
    if (_.isUndefined(apiDOrSO)) {
      throw new Error('apiDeclaration is required');
    } else if (!_.isPlainObject(apiDOrSO)) {
      throw new TypeError('apiDeclaration must be an object');
    }

    if (_.isUndefined(modelIdOrRef)) {
      throw new Error('modelId is required');
    }

    break;

  case '2.0':
    // Validate arguments
    if (_.isUndefined(apiDOrSO)) {
      throw new Error('swaggerObject is required');
    } else if (!_.isPlainObject(apiDOrSO)) {
      throw new TypeError('swaggerObject must be an object');
    }

    if (_.isUndefined(modelIdOrRef)) {
      throw new Error('modelRef is required');
    }

    break;
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  if (modelIdOrRef.charAt(0) !== '#') {
    if (this.version === '1.2') {
      modelIdOrRef = '#/models/' + modelIdOrRef;
    } else {
      throw new Error('modelRef must be a JSON Pointer');
    }
  }

  // Ensure the document is valid first
  if (swaggerVersion === '1.2') {
    validateAgainstSchema(this, 'apiDeclaration.json', apiDOrSO, doComposition);
  } else {
    this.validate(apiDOrSO, doComposition);
  }
};

/**
 * Validates a model based on its id.
 *
 * Note: For Swagger 1.2, we only perform structural validation prior to composing the model.
 *
 * @param {object} apiDOrSO - The Swagger Resource API Declaration (1.2) or the Swagger Object (2.0)
 * @param {string} modelIdOrRef - The model id (1.2) or the reference to the model (1.2 or 2.0)
 * @param {*} data - The model to validate
 * @param {resultCallback} callback - The result callback
 *
 * @returns undefined if validation passes or an object containing errors and/or warnings
 *
 * @throws Error if there are validation errors while creating
 */
Specification.prototype.validateModel = function (apiDOrSO, modelIdOrRef, data, callback) {
  switch (this.version) {
  case '1.2':
    // Validate arguments
    if (_.isUndefined(apiDOrSO)) {
      throw new Error('apiDeclaration is required');
    } else if (!_.isPlainObject(apiDOrSO)) {
      throw new TypeError('apiDeclaration must be an object');
    }

    if (_.isUndefined(modelIdOrRef)) {
      throw new Error('modelId is required');
    }

    break;

  case '2.0':
    // Validate arguments
    if (_.isUndefined(apiDOrSO)) {
      throw new Error('swaggerObject is required');
    } else if (!_.isPlainObject(apiDOrSO)) {
      throw new TypeError('swaggerObject must be an object');
    }

    if (_.isUndefined(modelIdOrRef)) {
      throw new Error('modelRef is required');
    }

    break;
  }

  if (_.isUndefined(data)) {
    throw new Error('data is required');
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  var that = this;

  this.composeModel(apiDOrSO, modelIdOrRef, function (err, result) {
    if (err) {
      return callback(err);
    }

    validateAgainstSchema(that, result, data, callback);
  });
};

/**
 * Returns a fully resolved document or document fragment.  (Does not perform validation as this is typically called
 * after validation occurs.))
 *
 * @param {object} document - The document to resolve or the document containing the reference to resolve
 * @param {string} [ptr] - The JSON Pointer or undefined to return the whole document
 * @param {resultCallback} callback - The result callback
 *
 * @returns the fully resolved document or fragment
 *
 * @throws Error if there are upstream errors
 */
Specification.prototype.resolve = function (document, ptr, callback) {
  var documentMetadata;
  var respond = function (document) {
    if (_.isString(ptr)) {
      return callback(undefined, traverse(document).get(JsonRefs.pathFromPtr(ptr)));
    } else {
      return callback(undefined, document);
    }
  };

  // Validate arguments
  if (_.isUndefined(document)) {
    throw new Error('document is required');
  } else if (!_.isPlainObject(document)) {
    throw new TypeError('document must be an object');
  }

  if (arguments.length === 2) {
    callback = arguments[1];
    ptr = undefined;
  }

  if (!_.isUndefined(ptr) && !_.isString(ptr)) {
    throw new TypeError('ptr must be a JSON Pointer string');
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  documentMetadata = getDocumentCache(document);

  // Swagger 1.2 is not supported due to invalid JSON References being used.  Even if the JSON References were valid,
  // the JSON Schema for Swagger 1.2 do not allow JavaScript objects in all places where the resoution would occur.
  if (documentMetadata.swaggerVersion === '1.2') {
    throw new Error('Swagger 1.2 is not supported');
  }

  if (!documentMetadata.resolved) {
    // Ensure the document is valid first
    this.validate(document, function (err, results) {
      if (err) {
        return callback(err);
      } else if (helpers.getErrorCount(results) > 0) {
        return handleValidationError(results, callback);
      }

      return respond(documentMetadata.resolved);
    });
  } else {
    return respond(documentMetadata.resolved);
  }
};

/**
 * Converts the Swagger 1.2 documents to a Swagger 2.0 document.
 *
 * @param {object} resourceListing - The Swagger Resource Listing
 * @param {object[]} [apiDeclarations] - The array of Swagger API Declarations
 * @param {boolean=false} [skipValidation] - Whether or not to skip validation
 * @param {resultCallback} callback - The result callback
 *
 * @returns the converted Swagger document
 *
 * @throws Error if the arguments provided are not valid
 */
Specification.prototype.convert = function (resourceListing, apiDeclarations, skipValidation, callback) {
  var doConvert = function (resourceListing, apiDeclarations) {
    callback(undefined, swaggerConverter(resourceListing, apiDeclarations));
  };

  if (this.version !== '1.2') {
    throw new Error('Specification#convert only works for Swagger 1.2');
  }

  // Validate arguments
  if (_.isUndefined(resourceListing)) {
    throw new Error('resourceListing is required');
  } else if (!_.isPlainObject(resourceListing)) {
    throw new TypeError('resourceListing must be an object');
  }

  // API Declarations are optional because swagger-converter was written to support it
  if (_.isUndefined(apiDeclarations)) {
    apiDeclarations = [];
  }

  if (!_.isArray(apiDeclarations)) {
    throw new TypeError('apiDeclarations must be an array');
  }

  if (arguments.length < 4) {
    callback = arguments[arguments.length - 1];
  }

  if (_.isUndefined(callback)) {
    throw new Error('callback is required');
  } else if (!_.isFunction(callback)) {
    throw new TypeError('callback must be a function');
  }

  if (skipValidation === true) {
    doConvert(resourceListing, apiDeclarations);
  } else {
    this.validate(resourceListing, apiDeclarations, function (err, results) {
      if (err) {
        return callback(err);
      } else if (helpers.getErrorCount(results) > 0) {
        return handleValidationError(results, callback);
      }

      doConvert(resourceListing, apiDeclarations);
    });
  }
};

module.exports.v1 = module.exports.v1_2 = new Specification('1.2'); // jshint ignore:line
module.exports.v2 = module.exports.v2_0 = new Specification('2.0'); // jshint ignore:line

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"../schemas/1.2/apiDeclaration.json":4,"../schemas/1.2/authorizationObject.json":5,"../schemas/1.2/dataType.json":6,"../schemas/1.2/dataTypeBase.json":7,"../schemas/1.2/infoObject.json":8,"../schemas/1.2/modelsObject.json":9,"../schemas/1.2/oauth2GrantType.json":10,"../schemas/1.2/operationObject.json":11,"../schemas/1.2/parameterObject.json":12,"../schemas/1.2/resourceListing.json":13,"../schemas/1.2/resourceObject.json":14,"../schemas/2.0/schema.json":15,"./helpers":1,"./validators":3}],3:[function(require,module,exports){
(function (global){
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

var _ = (typeof window !== "undefined" ? window['_'] : typeof global !== "undefined" ? global['_'] : null);
var helpers = require('./helpers');

// http://tools.ietf.org/html/rfc3339#section-5.6
var dateRegExp = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
// http://tools.ietf.org/html/rfc3339#section-5.6
var dateTimeRegExp = /^([0-9]{2}):([0-9]{2}):([0-9]{2})(.[0-9]+)?(z|([+-][0-9]{2}):([0-9]{2}))$/;
var isValidDate = module.exports.isValidDate = function (date) {
  var day;
  var matches;
  var month;

  if (_.isDate(date)) {
    return true;
  }

  if (!_.isString(date)) {
    date = date.toString();
  }

  matches = dateRegExp.exec(date);

  if (matches === null) {
    return false;
  }

  day = matches[3];
  month = matches[2];

  if (month < '01' || month > '12' || day < '01' || day > '31') {
    return false;
  }

  return true;
};
var isValidDateTime = module.exports.isValidDateTime = function (dateTime) {
  var hour;
  var date;
  var time;
  var matches;
  var minute;
  var parts;
  var second;
  var timezoneHours;
  var timezoneMinutes;

  if (_.isDate(dateTime)) {
    return true;
  }

  if (!_.isString(dateTime)) {
    dateTime = dateTime.toString();
  }

  parts = dateTime.toLowerCase().split('t');
  date = parts[0];
  time = parts.length > 1 ? parts[1] : undefined;

  if (!isValidDate(date)) {
    return false;
  }

  matches = dateTimeRegExp.exec(time);

  if (matches === null) {
    return false;
  }

  hour = matches[1];
  minute = matches[2];
  second = matches[3];
  if (matches[5] === 'z') {
    timezoneHours = 0;
    timezoneMinutes = 0;
  } else {
    timezoneHours = Number(matches[6]);
    timezoneMinutes = Number(matches[7]);
  }

  var validTimezoneMinutes = timezoneMinutes === 0 || timezoneMinutes === 15 || timezoneMinutes === 30 || timezoneMinutes === 45;

  if (hour > '23' || minute > '59' || second > '59' || timezoneHours > 14 || timezoneHours < -12 || !validTimezoneMinutes) {
    return false;
  }

  return true;
};

var throwErrorWithCode = function (code, msg) {
  var err = new Error(msg);

  err.code = code;
  err.failedValidation = true;

  throw err;
};

module.exports.validateAgainstSchema = function (schemaOrName, data, validator) {
  var sanitizeError = function (obj) {
    // Make anyOf/oneOf errors more human readable (Issue 200)
    var defType = ['additionalProperties', 'items'].indexOf(obj.path[obj.path.length - 1]) > -1 ?
          'schema' :
          obj.path[obj.path.length - 2];

    if (['ANY_OF_MISSING', 'ONE_OF_MISSING'].indexOf(obj.code) > -1) {
      switch (defType) {
      case 'parameters':
        defType = 'parameter';
        break;

      case 'responses':
        defType = 'response';
        break;

      case 'schema':
        defType += ' ' + obj.path[obj.path.length - 1];

        // no default
      }

      obj.message = 'Not a valid ' + defType + ' definition';
    }

    // Remove the params portion of the error
    delete obj.params;
    delete obj.schemaId;

    if (obj.inner) {
      _.each(obj.inner, function (nObj) {
        sanitizeError(nObj);
      });
    }
  };
  var schema = _.isPlainObject(schemaOrName) ? _.cloneDeep(schemaOrName) : schemaOrName;

  // We don't check this due to internal usage but if validator is not provided, schemaOrName must be a schema
  if (_.isUndefined(validator)) {
    validator = helpers.createJsonValidator([schema]);
  }

  var valid = validator.validate(data, schema);

  if (!valid) {
    try {
      throwErrorWithCode('SCHEMA_VALIDATION_FAILED', 'Failed schema validation');
    } catch (err) {
      err.results = {
        errors: _.map(validator.getLastErrors(), function (err) {
          sanitizeError(err);

          return err;
        }),
        warnings: []
      };

      throw err;
    }
  }
};


/**
 * Validates a schema of type array is properly formed (when necessar).
 *
 * *param {object} schema - The schema object to validate
 *
 * @throws Error if the schema says it's an array but it is not formed properly
 *
 * @see {@link https://github.com/swagger-api/swagger-spec/issues/174}
 */
var validateArrayType = module.exports.validateArrayType = function (schema) {
  // We have to do this manually for now
  if (schema.type === 'array' && _.isUndefined(schema.items)) {
    throwErrorWithCode('OBJECT_MISSING_REQUIRED_PROPERTY', 'Missing required property: items');
  }
};

/**
 * Validates the request or response content type (when necessary).
 *
 * @param {string[]} gPOrC - The valid consumes at the API scope
 * @param {string[]} oPOrC - The valid consumes at the operation scope
 * @param {object} reqOrRes - The request or response
 *
 * @throws Error if the content type is invalid
 */
module.exports.validateContentType = function (gPOrC, oPOrC, reqOrRes) {
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec7.html#sec7.2.1
  var isResponse = typeof reqOrRes.end === 'function';
  var contentType = isResponse ? reqOrRes.getHeader('content-type') : reqOrRes.headers['content-type'];
  var pOrC = _.map(_.union(gPOrC, oPOrC), function (contentType) {
    return contentType.split(';')[0];
  });

  if (!contentType) {
    if (isResponse) {
      contentType = 'text/plain';
    } else {
      contentType = 'application/octet-stream';
    }
  }

  contentType = contentType.split(';')[0];

  if (pOrC.length > 0 && (isResponse ?
                          true :
                          ['POST', 'PUT'].indexOf(reqOrRes.method) !== -1) && pOrC.indexOf(contentType) === -1) {
    throw new Error('Invalid content type (' + contentType + ').  These are valid: ' + pOrC.join(', '));
  }
};

/**
 * Validates the value against the allowable values (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string[]} allowed - The allowable values
 *
 * @throws Error if the value is not allowable
 */
var validateEnum = module.exports.validateEnum = function (val, allowed) {
  if (!_.isUndefined(allowed) && !_.isUndefined(val) && allowed.indexOf(val) === -1) {
    throwErrorWithCode('ENUM_MISMATCH', 'Not an allowable value (' + allowed.join(', ') + '): ' + val);
  }
};

/**
 * Validates the value is less than the maximum (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} maximum - The maximum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the maximum in its comparison
 *
 * @throws Error if the value is greater than the maximum
 */
var validateMaximum = module.exports.validateMaximum = function (val, maximum, type, exclusive) {
  var code = exclusive === true ? 'MAXIMUM_EXCLUSIVE' : 'MAXIMUM';
  var testMax;
  var testVal;

  if (_.isUndefined(exclusive)) {
    exclusive = false;
  }

  if (type === 'integer') {
    testVal = parseInt(val, 10);
  } else if (type === 'number') {
    testVal = parseFloat(val);
  }

  if (!_.isUndefined(maximum)) {
    testMax = parseFloat(maximum);

    if (exclusive && testVal >= testMax) {
      throwErrorWithCode(code, 'Greater than or equal to the configured maximum (' + maximum + '): ' + val);
    } else if (testVal > testMax) {
      throwErrorWithCode(code, 'Greater than the configured maximum (' + maximum + '): ' + val);
    }
  }
};

/**
 * Validates the array count is less than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} maxItems - The maximum number of items
 *
 * @throws Error if the value contains more items than allowable
 */
var validateMaxItems = module.exports.validateMaxItems = function (val, maxItems) {
  if (!_.isUndefined(maxItems) && val.length > maxItems) {
    throwErrorWithCode('ARRAY_LENGTH_LONG', 'Array is too long (' + val.length + '), maximum ' + maxItems);
  }
};

/**
 * Validates the value length is less than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} maxLength - The maximum length
 *
 * @throws Error if the value's length is greater than the maximum
 */
var validateMaxLength = module.exports.validateMaxLength = function (val, maxLength) {
  if (!_.isUndefined(maxLength) && val.length > maxLength) {
    throwErrorWithCode('MAX_LENGTH', 'String is too long (' + val.length + ' chars), maximum ' + maxLength);
  }
};

/**
 * Validates the value's property count is greater than the maximum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minProperties - The maximum number of properties
 *
 * @throws Error if the value's property count is less than the maximum
 */
var validateMaxProperties = module.exports.validateMaxProperties = function (val, maxProperties) {
  var propCount = _.isPlainObject(val) ? Object.keys(val).length : 0;

  if (!_.isUndefined(maxProperties) && propCount > maxProperties) {
    throwErrorWithCode('MAX_PROPERTIES',
                       'Number of properties is too many (' + propCount + ' properties), maximum ' + maxProperties);
  }
};

/**
 * Validates the value array count is greater than the minimum (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {string} minimum - The minimum value
 * @param {boolean} [exclusive=false] - Whether or not the value includes the minimum in its comparison
 *
 * @throws Error if the value is less than the minimum
 */
var validateMinimum = module.exports.validateMinimum = function (val, minimum, type, exclusive) {
  var code = exclusive === true ? 'MINIMUM_EXCLUSIVE' : 'MINIMUM';
  var testMin;
  var testVal;

  if (_.isUndefined(exclusive)) {
    exclusive = false;
  }

  if (type === 'integer') {
    testVal = parseInt(val, 10);
  } else if (type === 'number') {
    testVal = parseFloat(val);
  }

  if (!_.isUndefined(minimum)) {
    testMin = parseFloat(minimum);

    if (exclusive && testVal <= testMin) {
      throwErrorWithCode(code, 'Less than or equal to the configured minimum (' + minimum + '): ' + val);
    } else if (testVal < testMin) {
      throwErrorWithCode(code, 'Less than the configured minimum (' + minimum + '): ' + val);
    }
  }
};

/**
 * Validates the value value contains fewer items than allowed (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minItems - The minimum number of items
 *
 * @throws Error if the value contains fewer items than allowable
 */
var validateMinItems = module.exports.validateMinItems = function (val, minItems) {
  if (!_.isUndefined(minItems) && val.length < minItems) {
    throwErrorWithCode('ARRAY_LENGTH_SHORT', 'Array is too short (' + val.length + '), minimum ' + minItems);
  }
};

/**
 * Validates the value length is less than the minimum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minLength - The minimum length
 *
 * @throws Error if the value's length is less than the minimum
 */
var validateMinLength = module.exports.validateMinLength = function (val, minLength) {
  if (!_.isUndefined(minLength) && val.length < minLength) {
    throwErrorWithCode('MIN_LENGTH', 'String is too short (' + val.length + ' chars), minimum ' + minLength);
  }
};

/**
 * Validates the value's property count is less than or equal to the minimum (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} minProperties - The minimum number of properties
 *
 * @throws Error if the value's property count is less than the minimum
 */
var validateMinProperties = module.exports.validateMinProperties = function (val, minProperties) {
  var propCount = _.isPlainObject(val) ? Object.keys(val).length : 0;

  if (!_.isUndefined(minProperties) && propCount < minProperties) {
    throwErrorWithCode('MIN_PROPERTIES',
                       'Number of properties is too few (' + propCount + ' properties), minimum ' + minProperties);
  }
};

/**
 * Validates the value is a multiple of the provided number (when necessary).
 *
 * @param {*[]} val - The parameter value
 * @param {number} multipleOf - The number that should divide evenly into the value
 *
 * @throws Error if the value contains fewer items than allowable
 */
var validateMultipleOf = module.exports.validateMultipleOf = function (val, multipleOf) {
  if (!_.isUndefined(multipleOf) && val % multipleOf !== 0) {
    throwErrorWithCode('MULTIPLE_OF', 'Not a multiple of ' + multipleOf);
  }
};

/**
 * Validates the value matches a pattern (when necessary).
 *
 * @param {string} name - The parameter name
 * @param {*} val - The parameter value
 * @param {string} pattern - The pattern
 *
 * @throws Error if the value does not match the pattern
 */
var validatePattern = module.exports.validatePattern = function (val, pattern) {
  if (!_.isUndefined(pattern) && _.isNull(val.match(new RegExp(pattern)))) {
    throwErrorWithCode('PATTERN', 'Does not match required pattern: ' + pattern);
  }
};

/**
 * Validates the value requiredness (when necessary).
 *
 * @param {*} val - The parameter value
 * @param {boolean} required - Whether or not the parameter is required
 *
 * @throws Error if the value is required but is not present
 */
module.exports.validateRequiredness = function (val, required) {
  if (!_.isUndefined(required) && required === true && _.isUndefined(val)) {
    throwErrorWithCode('REQUIRED', 'Is required');
  }
};

/**
 * Validates the value type and format (when necessary).
 *
 * @param {string} version - The Swagger version
 * @param {*} val - The parameter value
 * @param {string} type - The parameter type
 * @param {string} format - The parameter format
 * @param {boolean} [skipError=false] - Whether or not to skip throwing an error (Useful for validating arrays)
 *
 * @throws Error if the value is not the proper type or format
 */
var validateTypeAndFormat = module.exports.validateTypeAndFormat =
  function validateTypeAndFormat (version, val, type, format, allowEmptyValue, skipError) {
    var result = true;
    var oVal = val;

    // If there is an empty value and we allow empty values, the value is always valid
    if (allowEmptyValue === true && val === '') {
      return;
    }

    if (_.isArray(val)) {
      _.each(val, function (aVal, index) {
        if (!validateTypeAndFormat(version, aVal, type, format, allowEmptyValue, true)) {
          throwErrorWithCode('INVALID_TYPE', 'Value at index ' + index + ' is not a valid ' + type + ': ' + aVal);
        }
      });
    } else {
      switch (type) {
      case 'boolean':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          if (val === 'false') {
            val = false;
          } else if (val === 'true') {
            val = true;
          }
        }

        result = _.isBoolean(val);
        break;
      case 'integer':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          val = Number(val);
        }

        result = _.isFinite(val) && (Math.round(val) === val);
        break;
      case 'number':
        // Coerce the value only for Swagger 1.2
        if (version === '1.2' && _.isString(val)) {
          val = Number(val);
        }

        result = _.isFinite(val);
        break;
      case 'string':
        if (!_.isUndefined(format)) {
          switch (format) {
          case 'date':
            result = isValidDate(val);
            break;
          case 'date-time':
            result = isValidDateTime(val);
            break;
          }
        }
        break;
      case 'void':
        result = _.isUndefined(val);
        break;
      }
    }

    if (skipError) {
      return result;
    } else if (!result) {
      throwErrorWithCode('INVALID_TYPE',
                         type !== 'void' ?
                           'Not a valid ' + (_.isUndefined(format) ? '' : format + ' ') + type + ': ' + oVal :
                           'Void does not allow a value');
    }
  };

/**
 * Validates the value values are unique (when necessary).
 *
 * @param {string[]} val - The parameter value
 * @param {boolean} isUnique - Whether or not the parameter values are unique
 *
 * @throws Error if the value has duplicates
 */
var validateUniqueItems = module.exports.validateUniqueItems = function (val, isUnique) {
  if (!_.isUndefined(isUnique) && _.uniq(val).length !== val.length) {
    throwErrorWithCode('ARRAY_UNIQUE', 'Does not allow duplicate values: ' + val.join(', '));
  }
};

/**
 * Validates the value against the schema.
 *
 * @param {string} version - The Swagger version
 * @param {object} schema - The schema to use to validate things
 * @param {string[]} path - The path to the schema
 * @param {*} [val] - The value to validate or undefined to use the default value provided by the schema
 *
 * @throws Error if any validation failes
 */
var validateSchemaConstraints = module.exports.validateSchemaConstraints = function (version, schema, path, val) {
  var resolveSchema = function (schema) {
    var resolved = schema;

    if (resolved.schema) {
      path = path.concat(['schema']);

      resolved = resolveSchema(resolved.schema);
    }

    return resolved;
  };

  var type = schema.type;
  var allowEmptyValue;

  if (!type) {
    if (!schema.schema) {
      if (path[path.length - 2] === 'responses') {
        type = 'void';
      } else {
        type = 'object';
      }
    } else {
      schema = resolveSchema(schema);
      type = schema.type || 'object';
    }
  }

  allowEmptyValue = schema ? schema.allowEmptyValue === true : false;

  try {
    // Always perform this check even if there is no value
    if (type === 'array') {
      validateArrayType(schema);
    }

    // Default to default value if necessary
    if (_.isUndefined(val)) {
      val = version === '1.2' ? schema.defaultValue : schema.default;

      path = path.concat([version === '1.2' ? 'defaultValue' : 'default']);
    }

    // If there is no explicit default value, return as all validations will fail
    if (_.isUndefined(val)) {
      return;
    }

    if (type === 'array') {
      _.each(val, function (val, index) {
        try {
          validateSchemaConstraints(version, schema.items || {}, path.concat(index.toString()), val);
        } catch (err) {
          err.message = 'Value at index ' + index + ' ' + (err.code === 'INVALID_TYPE' ? 'is ' : '') +
            err.message.charAt(0).toLowerCase() + err.message.substring(1);

          throw err;
        }
      });
    } else {
      validateTypeAndFormat(version, val, type, schema.format, allowEmptyValue);
    }

    // Validate enum
    validateEnum(val, schema.enum);

    // Validate maximum
    validateMaximum(val, schema.maximum, type, schema.exclusiveMaximum);


    // Validate maxItems (Swagger 2.0+)
    validateMaxItems(val, schema.maxItems);

    // Validate maxLength (Swagger 2.0+)
    validateMaxLength(val, schema.maxLength);

    // Validate maxProperties (Swagger 2.0+)
    validateMaxProperties(val, schema.maxProperties);

    // Validate minimum
    validateMinimum(val, schema.minimum, type, schema.exclusiveMinimum);

    // Validate minItems
    validateMinItems(val, schema.minItems);

    // Validate minLength (Swagger 2.0+)
    validateMinLength(val, schema.minLength);

    // Validate minProperties (Swagger 2.0+)
    validateMinProperties(val, schema.minProperties);

    // Validate multipleOf (Swagger 2.0+)
    validateMultipleOf(val, schema.multipleOf);

    // Validate pattern (Swagger 2.0+)
    validatePattern(val, schema.pattern);

    // Validate uniqueItems
    validateUniqueItems(val, schema.uniqueItems);
  } catch (err) {
    err.path = path;

    throw err;
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./helpers":1}],4:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/apiDeclaration.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "basePath", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apiVersion": { "type": "string" },
        "basePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^https?://"
        },
        "resourcePath": {
            "type": "string",
            "format": "uri",
            "pattern": "^/"
        },
        "apis": {
            "type": "array",
            "items": { "$ref": "#/definitions/apiObject" }
        },
        "models": {
            "type": "object",
            "additionalProperties": {
                "$ref": "modelsObject.json#"
            }
        },
        "produces": { "$ref": "#/definitions/mimeTypeArray" },
        "consumes": { "$ref": "#/definitions/mimeTypeArray" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    },
    "additionalProperties": false,
    "definitions": {
        "apiObject": {
            "type": "object",
            "required": [ "path", "operations" ],
            "properties": {
                "path": {
                    "type": "string",
                    "format": "uri-template",
                    "pattern": "^/"
                },
                "description": { "type": "string" },
                "operations": {
                    "type": "array",
                    "items": { "$ref": "operationObject.json#" }
                }
            },
            "additionalProperties": false
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],5:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/authorizationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "additionalProperties": {
        "oneOf": [
            {
                "$ref": "#/definitions/basicAuth"
            },
            {
                "$ref": "#/definitions/apiKey"
            },
            {
                "$ref": "#/definitions/oauth2"
            }
        ]
    },
    "definitions": {
        "basicAuth": {
            "required": [ "type" ],
            "properties": {
                "type": { "enum": [ "basicAuth" ] }
            },
            "additionalProperties": false
        },
        "apiKey": {
            "required": [ "type", "passAs", "keyname" ],
            "properties": {
                "type": { "enum": [ "apiKey" ] },
                "passAs": { "enum": [ "header", "query" ] },
                "keyname": { "type": "string" }
            },
            "additionalProperties": false
        },
        "oauth2": {
            "type": "object",
            "required": [ "type", "grantTypes" ],
            "properties": {
                "type": { "enum": [ "oauth2" ] },
                "scopes": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/oauth2Scope" }
                },
                "grantTypes": { "$ref": "oauth2GrantType.json#" }
            },
            "additionalProperties": false
        },
        "oauth2Scope": {
            "type": "object",
            "required": [ "scope" ],
            "properties": {
                "scope": { "type": "string" },
                "description": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}


},{}],6:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type as described by the specification (version 1.2)",
    "type": "object",
    "oneOf": [
        { "$ref": "#/definitions/refType" },
        { "$ref": "#/definitions/voidType" },
        { "$ref": "#/definitions/primitiveType" },
        { "$ref": "#/definitions/modelType" },
        { "$ref": "#/definitions/arrayType" }
    ],
    "definitions": {
        "refType": {
            "required": [ "$ref" ],
            "properties": {
                "$ref": { "type": "string" }
            },
            "additionalProperties": false
        },
        "voidType": {
            "enum": [ { "type": "void" } ]
        },
        "modelType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "type": "string",
                    "not": {
                        "enum": [ "boolean", "integer", "number", "string", "array" ]
                    }
                }
            },
            "additionalProperties": false
        },
        "primitiveType": {
            "required": [ "type" ],
            "properties": {
                "type": {
                    "enum": [ "boolean", "integer", "number", "string" ]
                },
                "format": { "type": "string" },
                "defaultValue": {
                    "not": { "type": [ "array", "object", "null" ] }
                },
                "enum": {
                    "type": "array",
                    "items": { "type": "string" },
                    "minItems": 1,
                    "uniqueItems": true
                },
                "minimum": { "type": "string" },
                "maximum": { "type": "string" }
            },
            "additionalProperties": false,
            "dependencies": {
                "format": {
                    "oneOf": [
                        {
                            "properties": {
                                "type": { "enum": [ "integer" ] },
                                "format": { "enum": [ "int32", "int64" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "number" ] },
                                "format": { "enum": [ "float", "double" ] }
                            }
                        },
                        {
                            "properties": {
                                "type": { "enum": [ "string" ] },
                                "format": {
                                    "enum": [ "byte", "date", "date-time" ]
                                }
                            }
                        }
                    ]
                },
                "enum": {
                    "properties": {
                        "type": { "enum": [ "string" ] }
                    }
                },
                "minimum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                },
                "maximum": {
                    "properties": {
                        "type": { "enum": [ "integer", "number" ] }
                    }
                }
            }
        },
        "arrayType": {
            "required": [ "type", "items" ],
            "properties": {
                "type": { "enum": [ "array" ] },
                "items": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/itemsObject" }
                },
                "uniqueItems": { "type": "boolean" }
            },
            "additionalProperties": false
        },
        "itemsObject": {
            "oneOf": [
                {
                    "$ref": "#/definitions/refType"
                },
                {
                    "allOf": [
                        {
                            "$ref": "#/definitions/primitiveType"
                        },
                        {
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}
},{}],7:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/dataTypeBase.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Data type fields (section 4.3.3)",
    "type": "object",
    "oneOf": [
        { "required": [ "type" ] },
        { "required": [ "$ref" ] }
    ],
    "properties": {
        "type": { "type": "string" },
        "$ref": { "type": "string" },
        "format": { "type": "string" },
        "defaultValue": {
            "not": { "type": [ "array", "object", "null" ] }
        },
        "enum": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true,
            "minItems": 1
        },
        "minimum": { "type": "string" },
        "maximum": { "type": "string" },
        "items": { "$ref": "#/definitions/itemsObject" },
        "uniqueItems": { "type": "boolean" }
    },
    "dependencies": {
        "format": {
            "oneOf": [
                {
                    "properties": {
                        "type": { "enum": [ "integer" ] },
                        "format": { "enum": [ "int32", "int64" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "number" ] },
                        "format": { "enum": [ "float", "double" ] }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "string" ] },
                        "format": {
                            "enum": [ "byte", "date", "date-time" ]
                        }
                    }
                }
            ]
        }
    },
    "definitions": {
        "itemsObject": {
            "oneOf": [
                {
                    "type": "object",
                    "required": [ "$ref" ],
                    "properties": {
                        "$ref": { "type": "string" }
                    },
                    "additionalProperties": false
                },
                {
                    "allOf": [
                        { "$ref": "#" },
                        {
                            "required": [ "type" ],
                            "properties": {
                                "type": {},
                                "format": {}
                            },
                            "additionalProperties": false
                        }
                    ]
                }
            ]
        }
    }
}

},{}],8:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/infoObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "info object (section 5.1.3)",
    "type": "object",
    "required": [ "title", "description" ],
    "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "termsOfServiceUrl": { "type": "string", "format": "uri" },
        "contact": { "type": "string", "format": "email" },
        "license": { "type": "string" },
        "licenseUrl": { "type": "string", "format": "uri" }
    },
    "additionalProperties": false
}
},{}],9:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/modelsObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "id", "properties" ],
    "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#/definitions/propertyObject" }
        },
        "subTypes": {
            "type": "array",
            "items": { "type": "string" },
            "uniqueItems": true
        },
        "discriminator": { "type": "string" }
    },
    "dependencies": {
        "subTypes": [ "discriminator" ]
    },
    "definitions": {
        "propertyObject": {
            "allOf": [
                {
                    "not": { "$ref": "#" }
                },
                {
                    "$ref": "dataTypeBase.json#"
                }
            ]
        }
    }
}


},{}],10:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/oauth2GrantType.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "minProperties": 1,
    "properties": {
        "implicit": { "$ref": "#/definitions/implicit" },
        "authorization_code": { "$ref": "#/definitions/authorizationCode" }
    },
    "definitions": {
        "implicit": {
            "type": "object",
            "required": [ "loginEndpoint" ],
            "properties": {
                "loginEndpoint": { "$ref": "#/definitions/loginEndpoint" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "authorizationCode": {
            "type": "object",
            "required": [ "tokenEndpoint", "tokenRequestEndpoint" ],
            "properties": {
                "tokenEndpoint": { "$ref": "#/definitions/tokenEndpoint" },
                "tokenRequestEndpoint": { "$ref": "#/definitions/tokenRequestEndpoint" }
            },
            "additionalProperties": false
        },
        "loginEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "additionalProperties": false
        },
        "tokenEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "tokenName": { "type": "string" }
            },
            "additionalProperties": false
        },
        "tokenRequestEndpoint": {
            "type": "object",
            "required": [ "url" ],
            "properties": {
                "url": { "type": "string", "format": "uri" },
                "clientIdName": { "type": "string" },
                "clientSecretName": { "type": "string" }
            },
            "additionalProperties": false
        }
    }
}
},{}],11:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/operationObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "method", "nickname", "parameters" ],
            "properties": {
                "method": { "enum": [ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" ] },
                "summary": { "type": "string", "maxLength": 120 },
                "notes": { "type": "string" },
                "nickname": {
                    "type": "string",
                    "pattern": "^[a-zA-Z0-9_]+$"
                },
                "authorizations": {
                    "type": "object",
                    "additionalProperties": {
                        "type": "array",
                        "items": {
                            "$ref": "authorizationObject.json#/definitions/oauth2Scope"
                        }
                    }
                },
                "parameters": {
                    "type": "array",
                    "items": { "$ref": "parameterObject.json#" }
                },
                "responseMessages": {
                    "type": "array",
                    "items": { "$ref": "#/definitions/responseMessageObject"}
                },
                "produces": { "$ref": "#/definitions/mimeTypeArray" },
                "consumes": { "$ref": "#/definitions/mimeTypeArray" },
                "deprecated": { "enum": [ "true", "false" ] }
            }
        }
    ],
    "definitions": {
        "responseMessageObject": {
            "type": "object",
            "required": [ "code", "message" ],
            "properties": {
                "code": { "$ref": "#/definitions/rfc2616section10" },
                "message": { "type": "string" },
                "responseModel": { "type": "string" }
            }
        },
        "rfc2616section10": {
            "type": "integer",
            "minimum": 100,
            "maximum": 600,
            "exclusiveMaximum": true
        },
        "mimeTypeArray": {
            "type": "array",
            "items": {
                "type": "string",
                "format": "mime-type"
            },
            "uniqueItems": true
        }
    }
}

},{}],12:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/parameterObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "allOf": [
        { "$ref": "dataTypeBase.json#" },
        {
            "required": [ "paramType", "name" ],
            "properties": {
                "paramType": {
                    "enum": [ "path", "query", "body", "header", "form" ]
                },
                "name": { "type": "string" },
                "description": { "type": "string" },
                "required": { "type": "boolean" },
                "allowMultiple": { "type": "boolean" }
            }
        },
        {
            "description": "type File requires special paramType and consumes",
            "oneOf": [
                {
                    "properties": {
                        "type": { "not": { "enum": [ "File" ] } }
                    }
                },
                {
                    "properties": {
                        "type": { "enum": [ "File" ] },
                        "paramType": { "enum": [ "form" ] },
                        "consumes": { "enum": [ "multipart/form-data" ] }
                    }
                }
            ]
        }
    ]
}

},{}],13:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceListing.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "swaggerVersion", "apis" ],
    "properties": {
        "swaggerVersion": { "enum": [ "1.2" ] },
        "apis": {
            "type": "array",
            "items": { "$ref": "resourceObject.json#" }
        },
        "apiVersion": { "type": "string" },
        "info": { "$ref": "infoObject.json#" },
        "authorizations": { "$ref": "authorizationObject.json#" }
    }
}

},{}],14:[function(require,module,exports){
module.exports={
    "id": "http://wordnik.github.io/schemas/v1.2/resourceObject.json#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "required": [ "path" ],
    "properties": {
        "path": { "type": "string", "format": "uri" },
        "description": { "type": "string" }
    },
    "additionalProperties": false
}
},{}],15:[function(require,module,exports){
module.exports={
  "title": "A JSON Schema for Swagger 2.0 API.",
  "id": "http://swagger.io/v2/schema.json#",
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "required": [
    "swagger",
    "info",
    "paths"
  ],
  "additionalProperties": false,
  "patternProperties": {
    "^x-": {
      "$ref": "#/definitions/vendorExtension"
    }
  },
  "properties": {
    "swagger": {
      "type": "string",
      "enum": [
        "2.0"
      ],
      "description": "The Swagger version of this document."
    },
    "info": {
      "$ref": "#/definitions/info"
    },
    "host": {
      "type": "string",
      "pattern": "^[^{}/ :\\\\]+(?::\\d+)?$",
      "description": "The host (name or ip) of the API. Example: 'swagger.io'"
    },
    "basePath": {
      "type": "string",
      "pattern": "^/",
      "description": "The base path to the API. Example: '/api'."
    },
    "schemes": {
      "$ref": "#/definitions/schemesList"
    },
    "consumes": {
      "description": "A list of MIME types accepted by the API.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "produces": {
      "description": "A list of MIME types the API can produce.",
      "$ref": "#/definitions/mediaTypeList"
    },
    "paths": {
      "$ref": "#/definitions/paths"
    },
    "definitions": {
      "$ref": "#/definitions/definitions"
    },
    "parameters": {
      "$ref": "#/definitions/parameterDefinitions"
    },
    "responses": {
      "$ref": "#/definitions/responseDefinitions"
    },
    "security": {
      "$ref": "#/definitions/security"
    },
    "securityDefinitions": {
      "$ref": "#/definitions/securityDefinitions"
    },
    "tags": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/tag"
      },
      "uniqueItems": true
    },
    "externalDocs": {
      "$ref": "#/definitions/externalDocs"
    }
  },
  "definitions": {
    "info": {
      "type": "object",
      "description": "General information about the API.",
      "required": [
        "version",
        "title"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "title": {
          "type": "string",
          "description": "A unique and precise title of the API."
        },
        "version": {
          "type": "string",
          "description": "A semantic version number of the API."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the API. Should be different from the title.  GitHub Flavored Markdown is allowed."
        },
        "termsOfService": {
          "type": "string",
          "description": "The terms of service for the API."
        },
        "contact": {
          "$ref": "#/definitions/contact"
        },
        "license": {
          "$ref": "#/definitions/license"
        }
      }
    },
    "contact": {
      "type": "object",
      "description": "Contact information for the owners of the API.",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The identifying name of the contact person/organization."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the contact information.",
          "format": "uri"
        },
        "email": {
          "type": "string",
          "description": "The email address of the contact person/organization.",
          "format": "email"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "license": {
      "type": "object",
      "required": [
        "name"
      ],
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string",
          "description": "The name of the license type. It's encouraged to use an OSI compatible license."
        },
        "url": {
          "type": "string",
          "description": "The URL pointing to the license.",
          "format": "uri"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "paths": {
      "type": "object",
      "description": "Relative paths to the individual endpoints. They must be relative to the 'basePath'.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        },
        "^/": {
          "$ref": "#/definitions/pathItem"
        }
      },
      "additionalProperties": false
    },
    "definitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/schema"
      },
      "description": "One or more JSON objects describing the schemas being consumed and produced by the API."
    },
    "parameterDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/parameter"
      },
      "description": "One or more JSON representations for parameters"
    },
    "responseDefinitions": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/response"
      },
      "description": "One or more JSON representations for parameters"
    },
    "externalDocs": {
      "type": "object",
      "additionalProperties": false,
      "description": "information about external documentation",
      "required": [
        "url"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "url": {
          "type": "string",
          "format": "uri"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "examples": {
      "type": "object",
      "additionalProperties": true
    },
    "mimeType": {
      "type": "string",
      "description": "The MIME type of the HTTP message."
    },
    "operation": {
      "type": "object",
      "required": [
        "responses"
      ],
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "uniqueItems": true
        },
        "summary": {
          "type": "string",
          "description": "A brief summary of the operation."
        },
        "description": {
          "type": "string",
          "description": "A longer description of the operation, GitHub Flavored Markdown is allowed."
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "operationId": {
          "type": "string",
          "description": "A unique identifier of the operation."
        },
        "produces": {
          "description": "A list of MIME types the API can produce.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "consumes": {
          "description": "A list of MIME types the API can consume.",
          "$ref": "#/definitions/mediaTypeList"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        },
        "responses": {
          "$ref": "#/definitions/responses"
        },
        "schemes": {
          "$ref": "#/definitions/schemesList"
        },
        "deprecated": {
          "type": "boolean",
          "default": false
        },
        "security": {
          "$ref": "#/definitions/security"
        }
      }
    },
    "pathItem": {
      "type": "object",
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "get": {
          "$ref": "#/definitions/operation"
        },
        "put": {
          "$ref": "#/definitions/operation"
        },
        "post": {
          "$ref": "#/definitions/operation"
        },
        "delete": {
          "$ref": "#/definitions/operation"
        },
        "options": {
          "$ref": "#/definitions/operation"
        },
        "head": {
          "$ref": "#/definitions/operation"
        },
        "patch": {
          "$ref": "#/definitions/operation"
        },
        "parameters": {
          "$ref": "#/definitions/parametersList"
        }
      }
    },
    "responses": {
      "type": "object",
      "description": "Response objects names can either be any valid HTTP status code or 'default'.",
      "minProperties": 1,
      "additionalProperties": false,
      "patternProperties": {
        "^([0-9]{3})$|^(default)$": {
          "$ref": "#/definitions/responseValue"
        },
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "not": {
        "type": "object",
        "additionalProperties": false,
        "patternProperties": {
          "^x-": {
            "$ref": "#/definitions/vendorExtension"
          }
        }
      }
    },
    "responseValue": {
      "oneOf": [
        {
          "$ref": "#/definitions/response"
        },
        {
          "$ref": "#/definitions/jsonReference"
        }
      ]
    },
    "response": {
      "type": "object",
      "required": [
        "description"
      ],
      "properties": {
        "description": {
          "type": "string"
        },
        "schema": {
          "oneOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "$ref": "#/definitions/fileSchema"
            }
          ]
        },
        "headers": {
          "$ref": "#/definitions/headers"
        },
        "examples": {
          "$ref": "#/definitions/examples"
        }
      },
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "headers": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/header"
      }
    },
    "header": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "vendorExtension": {
      "description": "Any property starting with x- is valid.",
      "additionalProperties": true,
      "additionalItems": true
    },
    "bodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "schema"
      ],
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "body"
          ]
        },
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "schema": {
          "$ref": "#/definitions/schema"
        }
      },
      "additionalProperties": false
    },
    "headerParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "header"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "queryParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "query"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "formDataParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "required": {
          "type": "boolean",
          "description": "Determines whether or not this parameter is required or optional.",
          "default": false
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "formData"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "allowEmptyValue": {
          "type": "boolean",
          "default": false,
          "description": "allows sending a parameter by name only or with an empty value."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array",
            "file"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormatWithMulti"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "pathParameterSubSchema": {
      "additionalProperties": false,
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "required": [
        "required"
      ],
      "properties": {
        "required": {
          "type": "boolean",
          "enum": [
            true
          ],
          "description": "Determines whether or not this parameter is required or optional."
        },
        "in": {
          "type": "string",
          "description": "Determines the location of the parameter.",
          "enum": [
            "path"
          ]
        },
        "description": {
          "type": "string",
          "description": "A brief description of the parameter. This could contain examples of use.  GitHub Flavored Markdown is allowed."
        },
        "name": {
          "type": "string",
          "description": "The name of the parameter."
        },
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "boolean",
            "integer",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      }
    },
    "nonBodyParameter": {
      "type": "object",
      "required": [
        "name",
        "in",
        "type"
      ],
      "oneOf": [
        {
          "$ref": "#/definitions/headerParameterSubSchema"
        },
        {
          "$ref": "#/definitions/formDataParameterSubSchema"
        },
        {
          "$ref": "#/definitions/queryParameterSubSchema"
        },
        {
          "$ref": "#/definitions/pathParameterSubSchema"
        }
      ]
    },
    "parameter": {
      "oneOf": [
        {
          "$ref": "#/definitions/bodyParameter"
        },
        {
          "$ref": "#/definitions/nonBodyParameter"
        }
      ]
    },
    "schema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "properties": {
        "$ref": {
          "type": "string"
        },
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "multipleOf": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
        },
        "maximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minLength": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "pattern": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
        },
        "maxItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "uniqueItems": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
        },
        "maxProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
        },
        "minProperties": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "enum": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
        },
        "additionalProperties": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "boolean"
            }
          ],
          "default": {}
        },
        "type": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/type"
        },
        "items": {
          "anyOf": [
            {
              "$ref": "#/definitions/schema"
            },
            {
              "type": "array",
              "minItems": 1,
              "items": {
                "$ref": "#/definitions/schema"
              }
            }
          ],
          "default": {}
        },
        "allOf": {
          "type": "array",
          "minItems": 1,
          "items": {
            "$ref": "#/definitions/schema"
          }
        },
        "properties": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/schema"
          },
          "default": {}
        },
        "discriminator": {
          "type": "string"
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "xml": {
          "$ref": "#/definitions/xml"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      },
      "additionalProperties": false
    },
    "fileSchema": {
      "type": "object",
      "description": "A deterministic version of a JSON Schema object.",
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      },
      "required": [
        "type"
      ],
      "properties": {
        "format": {
          "type": "string"
        },
        "title": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
        },
        "description": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
        },
        "default": {
          "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
        },
        "required": {
          "$ref": "http://json-schema.org/draft-04/schema#/definitions/stringArray"
        },
        "type": {
          "type": "string",
          "enum": [
            "file"
          ]
        },
        "readOnly": {
          "type": "boolean",
          "default": false
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        },
        "example": {}
      },
      "additionalProperties": false
    },
    "primitivesItems": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "string",
            "number",
            "integer",
            "boolean",
            "array"
          ]
        },
        "format": {
          "type": "string"
        },
        "items": {
          "$ref": "#/definitions/primitivesItems"
        },
        "collectionFormat": {
          "$ref": "#/definitions/collectionFormat"
        },
        "default": {
          "$ref": "#/definitions/default"
        },
        "maximum": {
          "$ref": "#/definitions/maximum"
        },
        "exclusiveMaximum": {
          "$ref": "#/definitions/exclusiveMaximum"
        },
        "minimum": {
          "$ref": "#/definitions/minimum"
        },
        "exclusiveMinimum": {
          "$ref": "#/definitions/exclusiveMinimum"
        },
        "maxLength": {
          "$ref": "#/definitions/maxLength"
        },
        "minLength": {
          "$ref": "#/definitions/minLength"
        },
        "pattern": {
          "$ref": "#/definitions/pattern"
        },
        "maxItems": {
          "$ref": "#/definitions/maxItems"
        },
        "minItems": {
          "$ref": "#/definitions/minItems"
        },
        "uniqueItems": {
          "$ref": "#/definitions/uniqueItems"
        },
        "enum": {
          "$ref": "#/definitions/enum"
        },
        "multipleOf": {
          "$ref": "#/definitions/multipleOf"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "security": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/securityRequirement"
      },
      "uniqueItems": true
    },
    "securityRequirement": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "uniqueItems": true
      }
    },
    "xml": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": {
          "type": "string"
        },
        "namespace": {
          "type": "string"
        },
        "prefix": {
          "type": "string"
        },
        "attribute": {
          "type": "boolean",
          "default": false
        },
        "wrapped": {
          "type": "boolean",
          "default": false
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "tag": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name"
      ],
      "properties": {
        "name": {
          "type": "string"
        },
        "description": {
          "type": "string"
        },
        "externalDocs": {
          "$ref": "#/definitions/externalDocs"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "securityDefinitions": {
      "type": "object",
      "additionalProperties": {
        "oneOf": [
          {
            "$ref": "#/definitions/basicAuthenticationSecurity"
          },
          {
            "$ref": "#/definitions/apiKeySecurity"
          },
          {
            "$ref": "#/definitions/oauth2ImplicitSecurity"
          },
          {
            "$ref": "#/definitions/oauth2PasswordSecurity"
          },
          {
            "$ref": "#/definitions/oauth2ApplicationSecurity"
          },
          {
            "$ref": "#/definitions/oauth2AccessCodeSecurity"
          }
        ]
      }
    },
    "basicAuthenticationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "basic"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "apiKeySecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "name",
        "in"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "apiKey"
          ]
        },
        "name": {
          "type": "string"
        },
        "in": {
          "type": "string",
          "enum": [
            "header",
            "query"
          ]
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ImplicitSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "implicit"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2PasswordSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "password"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2ApplicationSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "application"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2AccessCodeSecurity": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "type",
        "flow",
        "authorizationUrl",
        "tokenUrl"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "oauth2"
          ]
        },
        "flow": {
          "type": "string",
          "enum": [
            "accessCode"
          ]
        },
        "scopes": {
          "$ref": "#/definitions/oauth2Scopes"
        },
        "authorizationUrl": {
          "type": "string",
          "format": "uri"
        },
        "tokenUrl": {
          "type": "string",
          "format": "uri"
        },
        "description": {
          "type": "string"
        }
      },
      "patternProperties": {
        "^x-": {
          "$ref": "#/definitions/vendorExtension"
        }
      }
    },
    "oauth2Scopes": {
      "type": "object",
      "additionalProperties": {
        "type": "string"
      }
    },
    "mediaTypeList": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/mimeType"
      },
      "uniqueItems": true
    },
    "parametersList": {
      "type": "array",
      "description": "The parameters needed to send a valid API call.",
      "additionalItems": false,
      "items": {
        "oneOf": [
          {
            "$ref": "#/definitions/parameter"
          },
          {
            "$ref": "#/definitions/jsonReference"
          }
        ]
      },
      "uniqueItems": true
    },
    "schemesList": {
      "type": "array",
      "description": "The transfer protocol of the API.",
      "items": {
        "type": "string",
        "enum": [
          "http",
          "https",
          "ws",
          "wss"
        ]
      },
      "uniqueItems": true
    },
    "collectionFormat": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes"
      ],
      "default": "csv"
    },
    "collectionFormatWithMulti": {
      "type": "string",
      "enum": [
        "csv",
        "ssv",
        "tsv",
        "pipes",
        "multi"
      ],
      "default": "csv"
    },
    "title": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/title"
    },
    "description": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/description"
    },
    "default": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/default"
    },
    "multipleOf": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/multipleOf"
    },
    "maximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/maximum"
    },
    "exclusiveMaximum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMaximum"
    },
    "minimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/minimum"
    },
    "exclusiveMinimum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/exclusiveMinimum"
    },
    "maxLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minLength": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "pattern": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/pattern"
    },
    "maxItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveInteger"
    },
    "minItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/definitions/positiveIntegerDefault0"
    },
    "uniqueItems": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/uniqueItems"
    },
    "enum": {
      "$ref": "http://json-schema.org/draft-04/schema#/properties/enum"
    },
    "jsonReference": {
      "type": "object",
      "required": [
        "$ref"
      ],
      "additionalProperties": false,
      "properties": {
        "$ref": {
          "type": "string"
        }
      }
    }
  }
}
},{}],16:[function(require,module,exports){
module.exports={
    "id": "http://json-schema.org/draft-04/schema#",
    "$schema": "http://json-schema.org/draft-04/schema#",
    "description": "Core schema meta-schema",
    "definitions": {
        "schemaArray": {
            "type": "array",
            "minItems": 1,
            "items": { "$ref": "#" }
        },
        "positiveInteger": {
            "type": "integer",
            "minimum": 0
        },
        "positiveIntegerDefault0": {
            "allOf": [ { "$ref": "#/definitions/positiveInteger" }, { "default": 0 } ]
        },
        "simpleTypes": {
            "enum": [ "array", "boolean", "integer", "null", "number", "object", "string" ]
        },
        "stringArray": {
            "type": "array",
            "items": { "type": "string" },
            "minItems": 1,
            "uniqueItems": true
        }
    },
    "type": "object",
    "properties": {
        "id": {
            "type": "string",
            "format": "uri"
        },
        "$schema": {
            "type": "string",
            "format": "uri"
        },
        "title": {
            "type": "string"
        },
        "description": {
            "type": "string"
        },
        "default": {},
        "multipleOf": {
            "type": "number",
            "minimum": 0,
            "exclusiveMinimum": true
        },
        "maximum": {
            "type": "number"
        },
        "exclusiveMaximum": {
            "type": "boolean",
            "default": false
        },
        "minimum": {
            "type": "number"
        },
        "exclusiveMinimum": {
            "type": "boolean",
            "default": false
        },
        "maxLength": { "$ref": "#/definitions/positiveInteger" },
        "minLength": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "pattern": {
            "type": "string",
            "format": "regex"
        },
        "additionalItems": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "items": {
            "anyOf": [
                { "$ref": "#" },
                { "$ref": "#/definitions/schemaArray" }
            ],
            "default": {}
        },
        "maxItems": { "$ref": "#/definitions/positiveInteger" },
        "minItems": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "uniqueItems": {
            "type": "boolean",
            "default": false
        },
        "maxProperties": { "$ref": "#/definitions/positiveInteger" },
        "minProperties": { "$ref": "#/definitions/positiveIntegerDefault0" },
        "required": { "$ref": "#/definitions/stringArray" },
        "additionalProperties": {
            "anyOf": [
                { "type": "boolean" },
                { "$ref": "#" }
            ],
            "default": {}
        },
        "definitions": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "properties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "patternProperties": {
            "type": "object",
            "additionalProperties": { "$ref": "#" },
            "default": {}
        },
        "dependencies": {
            "type": "object",
            "additionalProperties": {
                "anyOf": [
                    { "$ref": "#" },
                    { "$ref": "#/definitions/stringArray" }
                ]
            }
        },
        "enum": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true
        },
        "type": {
            "anyOf": [
                { "$ref": "#/definitions/simpleTypes" },
                {
                    "type": "array",
                    "items": { "$ref": "#/definitions/simpleTypes" },
                    "minItems": 1,
                    "uniqueItems": true
                }
            ]
        },
        "allOf": { "$ref": "#/definitions/schemaArray" },
        "anyOf": { "$ref": "#/definitions/schemaArray" },
        "oneOf": { "$ref": "#/definitions/schemaArray" },
        "not": { "$ref": "#" }
    },
    "dependencies": {
        "exclusiveMaximum": [ "maximum" ],
        "exclusiveMinimum": [ "minimum" ]
    },
    "default": {}
}

},{}]},{},[2])(2)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvaGVscGVycy5qcyIsImxpYi9zcGVjcy5qcyIsImxpYi92YWxpZGF0b3JzLmpzIiwic2NoZW1hcy8xLjIvYXBpRGVjbGFyYXRpb24uanNvbiIsInNjaGVtYXMvMS4yL2F1dGhvcml6YXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9kYXRhVHlwZUJhc2UuanNvbiIsInNjaGVtYXMvMS4yL2luZm9PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL21vZGVsc09iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24iLCJzY2hlbWFzLzEuMi9vcGVyYXRpb25PYmplY3QuanNvbiIsInNjaGVtYXMvMS4yL3BhcmFtZXRlck9iamVjdC5qc29uIiwic2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24iLCJzY2hlbWFzLzEuMi9yZXNvdXJjZU9iamVjdC5qc29uIiwic2NoZW1hcy8yLjAvc2NoZW1hLmpzb24iLCJzY2hlbWFzL2pzb24tc2NoZW1hLWRyYWZ0LTA0Lmpzb24iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUN0UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDOStDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQzdwQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbklBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdGpEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8qXG4gKiBUaGUgTUlUIExpY2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQgQXBpZ2VlIENvcnBvcmF0aW9uXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuICogb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbFxuICogaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0c1xuICogdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbFxuICogY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4gKiBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuICpcbiAqIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4gKiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbiAqXG4gKiBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4gKiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbiAqIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuICogQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUlxuICogTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSxcbiAqIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU5cbiAqIFRIRSBTT0ZUV0FSRS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBfID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ18nXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ18nXSA6IG51bGwpO1xudmFyIEpzb25SZWZzID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ0pzb25SZWZzJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydKc29uUmVmcyddIDogbnVsbCk7XG52YXIgdHJhdmVyc2UgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1sndHJhdmVyc2UnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ3RyYXZlcnNlJ10gOiBudWxsKTtcbnZhciBaU2NoZW1hID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ1pTY2hlbWEnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1pTY2hlbWEnXSA6IG51bGwpO1xuXG52YXIgY3VzdG9tSnNvblNjaGVtYUZvcm1hdHMgPSBbJ2J5dGUnLCAnZG91YmxlJywgJ2Zsb2F0JywgJ2ludDMyJywgJ2ludDY0JywgJ21pbWUtdHlwZScsICd1cmktdGVtcGxhdGUnXTtcbnZhciBkcmFmdDA0SnNvbiA9IHJlcXVpcmUoJy4uL3NjaGVtYXMvanNvbi1zY2hlbWEtZHJhZnQtMDQuanNvbicpO1xudmFyIGRyYWZ0MDRVcmwgPSAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEnO1xudmFyIHNwZWNDYWNoZSA9IHt9O1xuXG5tb2R1bGUuZXhwb3J0cy5yZWdpc3RlckN1c3RvbUZvcm1hdHMgPSBmdW5jdGlvbiAoanNvbikge1xuICB0cmF2ZXJzZShqc29uKS5mb3JFYWNoKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbmFtZSA9IHRoaXMua2V5O1xuICAgIHZhciBmb3JtYXQgPSB0aGlzLm5vZGU7XG5cbiAgICBpZiAobmFtZSA9PT0gJ2Zvcm1hdCcgJiYgXy5pbmRleE9mKFpTY2hlbWEuZ2V0UmVnaXN0ZXJlZEZvcm1hdHMoKSwgZm9ybWF0KSA9PT0gLTEpIHtcbiAgICAgIFpTY2hlbWEucmVnaXN0ZXJGb3JtYXQoZm9ybWF0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLmNyZWF0ZUpzb25WYWxpZGF0b3IgPSBmdW5jdGlvbiAoc2NoZW1hcykge1xuICB2YXIgdmFsaWRhdG9yID0gbmV3IFpTY2hlbWEoe1xuICAgIGJyZWFrT25GaXJzdEVycm9yOiBmYWxzZSxcbiAgICByZXBvcnRQYXRoQXNBcnJheTogdHJ1ZVxuICB9KTtcbiAgdmFyIHJlc3VsdDtcblxuICAvLyBBZGQgdGhlIGRyYWZ0LTA0IHNwZWNcbiAgdmFsaWRhdG9yLnNldFJlbW90ZVJlZmVyZW5jZShkcmFmdDA0VXJsLCBkcmFmdDA0SnNvbik7XG5cbiAgLy8gU3dhZ2dlciB1c2VzIHNvbWUgdW5zdXBwb3J0ZWQvaW52YWxpZCBmb3JtYXRzIHNvIGp1c3QgbWFrZSB0aGVtIGFsbCBwYXNzXG4gIF8uZWFjaChjdXN0b21Kc29uU2NoZW1hRm9ybWF0cywgZnVuY3Rpb24gKGZvcm1hdCkge1xuICAgIFpTY2hlbWEucmVnaXN0ZXJGb3JtYXQoZm9ybWF0LCBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgLy8gQ29tcGlsZSBhbmQgdmFsaWRhdGUgdGhlIHNjaGVtYXNcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHNjaGVtYXMpKSB7XG4gICAgcmVzdWx0ID0gdmFsaWRhdG9yLmNvbXBpbGVTY2hlbWEoc2NoZW1hcyk7XG5cbiAgICAvLyBJZiB0aGVyZSBpcyBhbiBlcnJvciwgaXQncyB1bnJlY292ZXJhYmxlIHNvIGp1c3QgYmxvdyB0aGUgZWZmIHVwXG4gICAgaWYgKHJlc3VsdCA9PT0gZmFsc2UpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0pTT04gU2NoZW1hIGZpbGUnICsgKHNjaGVtYXMubGVuZ3RoID4gMSA/ICdzIGFyZScgOiAnIGlzJykgKyAnIGludmFsaWQ6Jyk7XG5cbiAgICAgIF8uZWFjaCh2YWxpZGF0b3IuZ2V0TGFzdEVycm9ycygpLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyAgJyArIChfLmlzQXJyYXkoZXJyLnBhdGgpID8gSnNvblJlZnMucGF0aFRvUHRyKGVyci5wYXRoKSA6IGVyci5wYXRoKSArICc6ICcgKyBlcnIubWVzc2FnZSk7XG4gICAgICB9KTtcblxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gY3JlYXRlIHZhbGlkYXRvciBkdWUgdG8gaW52YWxpZCBKU09OIFNjaGVtYScpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB2YWxpZGF0b3I7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5mb3JtYXRSZXN1bHRzID0gZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgaWYgKHJlc3VsdHMpIHtcbiAgICAvLyBVcGRhdGUgdGhlIHJlc3VsdHMgYmFzZWQgb24gaXRzIGNvbnRlbnQgdG8gaW5kaWNhdGUgc3VjY2Vzcy9mYWlsdXJlIGFjY29yZGluZ2x5XG4gICAgcmVzdWx0cyA9IChyZXN1bHRzLmVycm9ycy5sZW5ndGggKyByZXN1bHRzLndhcm5pbmdzLmxlbmd0aCArXG4gICAgXy5yZWR1Y2UocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChjb3VudCwgYVJlc3VsdCkge1xuICAgICAgaWYgKGFSZXN1bHQpIHtcbiAgICAgICAgY291bnQgKz0gYVJlc3VsdC5lcnJvcnMubGVuZ3RoICsgYVJlc3VsdC53YXJuaW5ncy5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb3VudDtcbiAgICB9LCAwKSA+IDApID8gcmVzdWx0cyA6IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiByZXN1bHRzO1xufTtcblxudmFyIGdldEVycm9yQ291bnQgPSBtb2R1bGUuZXhwb3J0cy5nZXRFcnJvckNvdW50ID0gZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgdmFyIGVycm9ycyA9IDA7XG5cbiAgaWYgKHJlc3VsdHMpIHtcbiAgICBlcnJvcnMgPSByZXN1bHRzLmVycm9ycy5sZW5ndGg7XG5cbiAgICBfLmVhY2gocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhZFJlc3VsdHMpIHtcbiAgICAgIGlmIChhZFJlc3VsdHMpIHtcbiAgICAgICAgZXJyb3JzICs9IGFkUmVzdWx0cy5lcnJvcnMubGVuZ3RoO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIGVycm9ycztcbn07XG5cbnZhciBjb2VyY2VWZXJzaW9uID0gZnVuY3Rpb24gKHZlcnNpb24pIHtcbiAgLy8gQ29udmVydCB0aGUgdmVyc2lvbiB0byBhIG51bWJlciAoUmVxdWlyZWQgZm9yIGhlbHBlcnMuZ2V0U3BlYylcbiAgaWYgKHZlcnNpb24gJiYgIV8uaXNTdHJpbmcodmVyc2lvbikpIHtcbiAgICB2ZXJzaW9uID0gdmVyc2lvbi50b1N0cmluZygpO1xuXG4gICAgLy8gSGFuZGxlIHJvdW5kaW5nIGlzc3VlcyAoT25seSByZXF1aXJlZCBmb3Igd2hlbiBTd2FnZ2VyIHZlcnNpb24gZW5kcyBpbiAnLjAnKVxuICAgIGlmICh2ZXJzaW9uLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICAgIHZlcnNpb24gKz0gJy4wJztcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdmVyc2lvbjtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgcHJvcGVyIHNwZWNpZmljYXRpb24gYmFzZWQgb24gdGhlIGh1bWFuIHJlYWRhYmxlIHZlcnNpb24uXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgaHVtYW4gcmVhZGFibGUgU3dhZ2dlciB2ZXJzaW9uIChFeDogMS4yKVxuICogQHBhcmFtIHtbYm9vbGVhbj1mYWxzZV19IHRocm93RXJyb3IgLSBUaHJvdyBhbiBlcnJvciBpZiB0aGUgdmVyc2lvbiBjb3VsZCBub3QgYmUgaWRlbnRpZmllZFxuICpcbiAqIEByZXR1cm5zIHRoZSBjb3JyZXNwb25kaW5nIFN3YWdnZXIgU3BlY2lmaWNhdGlvbiBvYmplY3Qgb3IgdW5kZWZpbmVkIGlmIHRoZXJlIGlzIG5vbmVcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0U3BlYyA9IGZ1bmN0aW9uICh2ZXJzaW9uLCB0aHJvd0Vycm9yKSB7XG4gIHZhciBzcGVjO1xuXG4gIHZlcnNpb24gPSBjb2VyY2VWZXJzaW9uKHZlcnNpb24pO1xuICBzcGVjID0gc3BlY0NhY2hlW3ZlcnNpb25dO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKHNwZWMpKSB7XG4gICAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gICAgY2FzZSAnMS4yJzpcbiAgICAgIHNwZWMgPSByZXF1aXJlKCcuLi9saWIvc3BlY3MnKS52MV8yOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcblxuICAgICAgYnJlYWs7XG5cbiAgICBjYXNlICcyLjAnOlxuICAgICAgc3BlYyA9IHJlcXVpcmUoJy4uL2xpYi9zcGVjcycpLnYyXzA7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuXG4gICAgICBicmVhaztcblxuICAgIGRlZmF1bHQ6XG4gICAgICBpZiAodGhyb3dFcnJvciA9PT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vuc3VwcG9ydGVkIFN3YWdnZXIgdmVyc2lvbjogJyArIHZlcnNpb24pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBzcGVjO1xufTtcblxuLyoqXG4gKiBBdGVtcHRzIHRvIGZpZ3VyZSBvdXQgdGhlIFN3YWdnZXIgdmVyc2lvbiBmcm9tIHRoZSBTd2FnZ2VyIGRvY3VtZW50LlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBkb2N1bWVudCAtIFRoZSBTd2FnZ2VyIGRvY3VtZW50XG4gKlxuICogQHJldHVybnMgdGhlIFN3YWdnZXIgdmVyc2lvbiBvciB1bmRlZmluZWQgaWYgdGhlIGRvY3VtZW50IGlzIG5vdCBhIFN3YWdnZXIgZG9jdW1lbnRcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0U3dhZ2dlclZlcnNpb24gPSBmdW5jdGlvbiAoZG9jdW1lbnQpIHtcbiAgcmV0dXJuIF8uaXNQbGFpbk9iamVjdChkb2N1bWVudCkgPyBjb2VyY2VWZXJzaW9uKGRvY3VtZW50LnN3YWdnZXJWZXJzaW9uIHx8IGRvY3VtZW50LnN3YWdnZXIpIDogdW5kZWZpbmVkO1xufTtcblxubW9kdWxlLmV4cG9ydHMucHJpbnRWYWxpZGF0aW9uUmVzdWx0cyA9IGZ1bmN0aW9uICh2ZXJzaW9uLCBhcGlET3JTTywgYXBpRGVjbGFyYXRpb25zLCByZXN1bHRzLCBwcmludFN1bW1hcnkpIHtcbiAgdmFyIGhhc0Vycm9ycyA9IGdldEVycm9yQ291bnQocmVzdWx0cykgPiAwO1xuICB2YXIgc3RyZWFtID0gaGFzRXJyb3JzID8gY29uc29sZS5lcnJvciA6IGNvbnNvbGUubG9nO1xuICB2YXIgcGx1cmFsaXplID0gZnVuY3Rpb24gKHN0cmluZywgY291bnQpIHtcbiAgICByZXR1cm4gY291bnQgPT09IDEgPyBzdHJpbmcgOiBzdHJpbmcgKyAncyc7XG4gIH07XG4gIHZhciBwcmludEVycm9yc09yV2FybmluZ3MgPSBmdW5jdGlvbiAoaGVhZGVyLCBlbnRyaWVzLCBpbmRlbnQpIHtcbiAgICBpZiAoaGVhZGVyKSB7XG4gICAgICBzdHJlYW0oaGVhZGVyICsgJzonKTtcbiAgICAgIHN0cmVhbSgpO1xuICAgIH1cblxuICAgIF8uZWFjaChlbnRyaWVzLCBmdW5jdGlvbiAoZW50cnkpIHtcbiAgICAgIHN0cmVhbShuZXcgQXJyYXkoaW5kZW50ICsgMSkuam9pbignICcpICsgSnNvblJlZnMucGF0aFRvUHRyKGVudHJ5LnBhdGgpICsgJzogJyArIGVudHJ5Lm1lc3NhZ2UpO1xuXG4gICAgICBpZiAoZW50cnkuaW5uZXIpIHtcbiAgICAgICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzICh1bmRlZmluZWQsIGVudHJ5LmlubmVyLCBpbmRlbnQgKyAyKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChoZWFkZXIpIHtcbiAgICAgIHN0cmVhbSgpO1xuICAgIH1cbiAgfTtcbiAgdmFyIGVycm9yQ291bnQgPSAwO1xuICB2YXIgd2FybmluZ0NvdW50ID0gMDtcblxuICBzdHJlYW0oKTtcblxuICBpZiAocmVzdWx0cy5lcnJvcnMubGVuZ3RoID4gMCkge1xuICAgIGVycm9yQ291bnQgKz0gcmVzdWx0cy5lcnJvcnMubGVuZ3RoO1xuXG4gICAgcHJpbnRFcnJvcnNPcldhcm5pbmdzKCdBUEkgRXJyb3JzJywgcmVzdWx0cy5lcnJvcnMsIDIpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMud2FybmluZ3MubGVuZ3RoID4gMCkge1xuICAgIHdhcm5pbmdDb3VudCArPSByZXN1bHRzLndhcm5pbmdzLmxlbmd0aDtcblxuICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnQVBJIFdhcm5pbmdzJywgcmVzdWx0cy53YXJuaW5ncywgMik7XG4gIH1cblxuICBpZiAocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMpIHtcbiAgICByZXN1bHRzLmFwaURlY2xhcmF0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uIChhZFJlc3VsdCwgaW5kZXgpIHtcbiAgICAgIGlmICghYWRSZXN1bHQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICB2YXIgbmFtZSA9IGFwaURlY2xhcmF0aW9uc1tpbmRleF0ucmVzb3VyY2VQYXRoIHx8IGluZGV4O1xuXG4gICAgICBpZiAoYWRSZXN1bHQuZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgZXJyb3JDb3VudCArPSBhZFJlc3VsdC5lcnJvcnMubGVuZ3RoO1xuXG4gICAgICAgIHByaW50RXJyb3JzT3JXYXJuaW5ncygnICBBUEkgRGVjbGFyYXRpb24gKCcgKyBuYW1lICsgJykgRXJyb3JzJywgYWRSZXN1bHQuZXJyb3JzLCA0KTtcbiAgICAgIH1cblxuICAgICAgaWYgKGFkUmVzdWx0Lndhcm5pbmdzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgd2FybmluZ0NvdW50ICs9IGFkUmVzdWx0Lndhcm5pbmdzLmxlbmd0aDtcblxuICAgICAgICBwcmludEVycm9yc09yV2FybmluZ3MoJyAgQVBJIERlY2xhcmF0aW9uICgnICsgbmFtZSArICcpIFdhcm5pbmdzJywgYWRSZXN1bHQud2FybmluZ3MsIDQpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKHByaW50U3VtbWFyeSkge1xuICAgIGlmIChlcnJvckNvdW50ID4gMCkge1xuICAgICAgc3RyZWFtKGVycm9yQ291bnQgKyAnICcgKyBwbHVyYWxpemUoJ2Vycm9yJywgZXJyb3JDb3VudCkgKyAnIGFuZCAnICsgd2FybmluZ0NvdW50ICsgJyAnICtcbiAgICAgICAgICAgICAgICAgICAgcGx1cmFsaXplKCd3YXJuaW5nJywgd2FybmluZ0NvdW50KSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0cmVhbSgnVmFsaWRhdGlvbiBzdWNjZWVkZWQgYnV0IHdpdGggJyArIHdhcm5pbmdDb3VudCArICcgJyArIHBsdXJhbGl6ZSgnd2FybmluZycsIHdhcm5pbmdDb3VudCkpO1xuICAgIH1cbiAgfVxuXG4gIHN0cmVhbSgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMuc3dhZ2dlck9wZXJhdGlvbk1ldGhvZHMgPSBbXG4gICdERUxFVEUnLFxuICAnR0VUJyxcbiAgJ0hFQUQnLFxuICAnT1BUSU9OUycsXG4gICdQQVRDSCcsXG4gICdQT1NUJyxcbiAgJ1BVVCdcbl07XG4iLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcbnZhciBhc3luYyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Wydhc3luYyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnYXN5bmMnXSA6IG51bGwpO1xudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcbnZhciBKc29uUmVmcyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydKc29uUmVmcyddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsnSnNvblJlZnMnXSA6IG51bGwpO1xudmFyIFNwYXJrTUQ1ID0gKHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3dbJ1NwYXJrTUQ1J10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydTcGFya01ENSddIDogbnVsbCk7XG52YXIgc3dhZ2dlckNvbnZlcnRlciA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydTd2FnZ2VyQ29udmVydGVyJ11bJ2NvbnZlcnQnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ1N3YWdnZXJDb252ZXJ0ZXInXVsnY29udmVydCddIDogbnVsbCk7XG52YXIgdHJhdmVyc2UgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1sndHJhdmVyc2UnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ3RyYXZlcnNlJ10gOiBudWxsKTtcbnZhciB2YWxpZGF0b3JzID0gcmVxdWlyZSgnLi92YWxpZGF0b3JzJyk7XG52YXIgWUFNTCA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Wydqc3lhbWwnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ2pzeWFtbCddIDogbnVsbCk7XG5cbi8vIFdvcmsgYXJvdW5kIHN3YWdnZXItY29udmVydGVyIHBhY2thZ2luZyBpc3N1ZSAoQnJvd3NlciBidWlsZHMgb25seSlcbmlmIChfLmlzUGxhaW5PYmplY3Qoc3dhZ2dlckNvbnZlcnRlcikpIHtcbiAgc3dhZ2dlckNvbnZlcnRlciA9IGdsb2JhbC5Td2FnZ2VyQ29udmVydGVyLmNvbnZlcnQ7XG59XG5cbnZhciBkb2N1bWVudENhY2hlID0ge307XG5cbnZhciBzYW5pdGl6ZVJlZiA9IGZ1bmN0aW9uICh2ZXJzaW9uLCByZWYpIHtcbiAgcmV0dXJuIHZlcnNpb24gIT09ICcxLjInID8gcmVmIDogcmVmLnJlcGxhY2UoJyMvbW9kZWxzLycsICcnKTtcbn07XG5cbnZhciBzd2FnZ2VyMVJlZlByZVByb2Nlc29yID0gZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcE9iaiA9IF8uY2xvbmVEZWVwKG9iaik7XG5cbiAgcE9iai4kcmVmID0gJyMvbW9kZWxzLycgKyBvYmouJHJlZjtcblxuICByZXR1cm4gcE9iajtcbn07XG52YXIgdmFsaWRPcHRpb25OYW1lcyA9IF8ubWFwKGhlbHBlcnMuc3dhZ2dlck9wZXJhdGlvbk1ldGhvZHMsIGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgcmV0dXJuIG1ldGhvZC50b0xvd2VyQ2FzZSgpO1xufSk7XG5cbnZhciBpc1JlbW90ZVB0ciA9IGZ1bmN0aW9uIChyZWZEZXRhaWxzKSB7XG4gIHJldHVybiBbJ3JlbGF0aXZlJywgJ3JlbW90ZSddLmluZGV4T2YocmVmRGV0YWlscy50eXBlKSA+IC0xO1xufTtcblxudmFyIGNyZWF0ZUVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gKGNvZGUsIG1lc3NhZ2UsIHBhdGgsIGRlc3QpIHtcbiAgZGVzdC5wdXNoKHtcbiAgICBjb2RlOiBjb2RlLFxuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgcGF0aDogcGF0aFxuICB9KTtcbn07XG5cbnZhciBhZGRSZWZlcmVuY2UgPSBmdW5jdGlvbiAoY2FjaGVFbnRyeSwgZGVmUGF0aE9yUHRyLCByZWZQYXRoT3JQdHIsIHJlc3VsdHMsIG9taXRFcnJvcikge1xuICB2YXIgcmVzdWx0ID0gdHJ1ZTtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gaGVscGVycy5nZXRTd2FnZ2VyVmVyc2lvbihjYWNoZUVudHJ5LnJlc29sdmVkKTtcbiAgdmFyIGRlZlBhdGggPSBfLmlzQXJyYXkoZGVmUGF0aE9yUHRyKSA/IGRlZlBhdGhPclB0ciA6IEpzb25SZWZzLnBhdGhGcm9tUHRyKGRlZlBhdGhPclB0cik7XG4gIHZhciBkZWZQdHIgPSBfLmlzQXJyYXkoZGVmUGF0aE9yUHRyKSA/IEpzb25SZWZzLnBhdGhUb1B0cihkZWZQYXRoT3JQdHIpIDogZGVmUGF0aE9yUHRyO1xuICB2YXIgcmVmUGF0aCA9IF8uaXNBcnJheShyZWZQYXRoT3JQdHIpID8gcmVmUGF0aE9yUHRyIDogSnNvblJlZnMucGF0aEZyb21QdHIocmVmUGF0aE9yUHRyKTtcbiAgdmFyIHJlZlB0ciA9IF8uaXNBcnJheShyZWZQYXRoT3JQdHIpID8gSnNvblJlZnMucGF0aFRvUHRyKHJlZlBhdGhPclB0cikgOiByZWZQYXRoT3JQdHI7XG4gIHZhciBjb2RlO1xuICB2YXIgZGVmO1xuICB2YXIgZGlzcGxheUlkO1xuICB2YXIgaTtcbiAgdmFyIG1zZ1ByZWZpeDtcbiAgdmFyIHR5cGU7XG5cbiAgZGVmID0gY2FjaGVFbnRyeS5kZWZpbml0aW9uc1tkZWZQdHJdO1xuICB0eXBlID0gZGVmUGF0aFswXTtcbiAgY29kZSA9IHR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb25zJyA/XG4gICAgJ1NFQ1VSSVRZX0RFRklOSVRJT04nIDpcbiAgICB0eXBlLnN1YnN0cmluZygwLCB0eXBlLmxlbmd0aCAtIDEpLnRvVXBwZXJDYXNlKCk7XG4gIGRpc3BsYXlJZCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IGRlZlBhdGhbZGVmUGF0aC5sZW5ndGggLSAxXSA6IGRlZlB0cjtcbiAgbXNnUHJlZml4ID0gdHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbnMnID9cbiAgICAnU2VjdXJpdHkgZGVmaW5pdGlvbicgOlxuICAgIGNvZGUuY2hhckF0KDApICsgY29kZS5zdWJzdHJpbmcoMSkudG9Mb3dlckNhc2UoKTtcblxuICAvLyBUaGlzIGlzIGFuIGF1dGhvcml6YXRpb24gc2NvcGUgcmVmZXJlbmNlXG4gIGlmIChbJ2F1dGhvcml6YXRpb25zJywgJ3NlY3VyaXR5RGVmaW5pdGlvbnMnXS5pbmRleE9mKGRlZlBhdGhbMF0pID4gLTEgJiYgZGVmUGF0aFsyXSA9PT0gJ3Njb3BlcycpIHtcbiAgICBjb2RlICs9ICdfU0NPUEUnO1xuICAgIG1zZ1ByZWZpeCArPSAnIHNjb3BlJztcbiAgfVxuXG4gIC8vIElmIHRoZSByZWZlcmVuY2Ugd2FzIG5vdCBmb3VuZCBhbmQgdGhpcyBpcyBub3QgYW4gYXV0aG9yaXphdGlvbi9zZWN1cml0eSBzY29wZSByZWZlcmVuY2UsIGF0dGVtcHQgdG8gZmluZCBhXG4gIC8vIHBhcmVudCBvYmplY3QgdG8gYWRkIHRoZSByZWZlcmVuY2UgdG9vLiAgKElzc3VlIDE3NilcbiAgaWYgKF8uaXNVbmRlZmluZWQoZGVmKSAmJiBbJ0FVVEhPUklaQVRJT05fU0NPUEUnLCAnU0VDVVJJVFlfREVGSU5JVElPTl9TQ09QRSddLmluZGV4T2YoY29kZSkgPT09IC0xKSB7XG4gICAgLy8gQXR0ZW1wdCB0byBmaW5kIHRoZSBkZWZpbml0aW9uIGluIGNhc2UgdGhlIHJlZmVyZW5jZSBpcyB0byBhIHBhdGggd2l0aGluIGEgZGVmaW5pdGlvbmBcbiAgICBmb3IgKGkgPSAxOyBpIDwgZGVmUGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHBQYXRoID0gZGVmUGF0aC5zbGljZSgwLCBkZWZQYXRoLmxlbmd0aCAtIGkpO1xuICAgICAgdmFyIHBQdHIgPSBKc29uUmVmcy5wYXRoVG9QdHIocFBhdGgpO1xuICAgICAgdmFyIHBEZWYgPSBjYWNoZUVudHJ5LmRlZmluaXRpb25zW3BQdHJdO1xuXG4gICAgICBpZiAoIV8uaXNVbmRlZmluZWQocERlZikpIHtcbiAgICAgICAgZGVmID0gcERlZjtcblxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChkZWYpKSB7XG4gICAgaWYgKCFvbWl0RXJyb3IpIHtcbiAgICAgIGlmIChjYWNoZUVudHJ5LnN3YWdnZXJWZXJzaW9uICE9PSAnMS4yJyAmJiBbJ1NFQ1VSSVRZX0RFRklOSVRJT04nLCAnU0VDVVJJVFlfREVGSU5JVElPTl9TQ09QRSddLmluZGV4T2YoY29kZSkgPT09IC0xKSB7XG4gICAgICAgIHJlZlBhdGgucHVzaCgnJHJlZicpO1xuICAgICAgfVxuXG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlLCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIGRpc3BsYXlJZCwgcmVmUGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9XG5cbiAgICByZXN1bHQgPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChkZWYucmVmZXJlbmNlcykpIHtcbiAgICAgIGRlZi5yZWZlcmVuY2VzID0gW107XG4gICAgfVxuXG4gICAgZGVmLnJlZmVyZW5jZXMucHVzaChyZWZQdHIpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbnZhciBnZXRPckNvbXBvc2VTY2hlbWEgPSBmdW5jdGlvbiAoZG9jdW1lbnRNZXRhZGF0YSwgbW9kZWxJZCkge1xuICB2YXIgdGl0bGUgPSAnQ29tcG9zZWQgJyArIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgSnNvblJlZnMucGF0aEZyb21QdHIobW9kZWxJZCkucG9wKCkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGVsSWQpO1xuICB2YXIgbWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW21vZGVsSWRdO1xuICB2YXIgb3JpZ2luYWxUID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbCk7XG4gIHZhciByZXNvbHZlZFQgPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLnJlc29sdmVkKTtcbiAgdmFyIGNvbXBvc2VkO1xuICB2YXIgb3JpZ2luYWw7XG5cbiAgaWYgKCFtZXRhZGF0YSkge1xuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICBvcmlnaW5hbCA9IF8uY2xvbmVEZWVwKG9yaWdpbmFsVC5nZXQoSnNvblJlZnMucGF0aEZyb21QdHIobW9kZWxJZCkpKTtcbiAgY29tcG9zZWQgPSBfLmNsb25lRGVlcChyZXNvbHZlZFQuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUHRyKG1vZGVsSWQpKSk7XG5cbiAgLy8gQ29udmVydCB0aGUgU3dhZ2dlciAxLjIgZG9jdW1lbnQgdG8gYSB2YWxpZCBKU09OIFNjaGVtYSBmaWxlXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgIC8vIENyZWF0ZSBpbmhlcml0YW5jZSBtb2RlbFxuICAgIGlmIChtZXRhZGF0YS5saW5lYWdlLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbXBvc2VkLmFsbE9mID0gW107XG5cbiAgICAgIF8uZWFjaChtZXRhZGF0YS5saW5lYWdlLCBmdW5jdGlvbiAobW9kZWxJZCkge1xuICAgICAgICBjb21wb3NlZC5hbGxPZi5wdXNoKGdldE9yQ29tcG9zZVNjaGVtYShkb2N1bWVudE1ldGFkYXRhLCBtb2RlbElkKSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgdGhlIHN1YlR5cGVzIHByb3BlcnR5XG4gICAgZGVsZXRlIGNvbXBvc2VkLnN1YlR5cGVzO1xuXG4gICAgXy5lYWNoKGNvbXBvc2VkLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIG9Qcm9wID0gb3JpZ2luYWwucHJvcGVydGllc1tuYW1lXTtcblxuICAgICAgLy8gQ29udmVydCB0aGUgc3RyaW5nIHZhbHVlcyB0byBudW1lcmljYWwgdmFsdWVzXG4gICAgICBfLmVhY2goWydtYXhpbXVtJywgJ21pbmltdW0nXSwgZnVuY3Rpb24gKHByb3ApIHtcbiAgICAgICAgaWYgKF8uaXNTdHJpbmcocHJvcGVydHlbcHJvcF0pKSB7XG4gICAgICAgICAgcHJvcGVydHlbcHJvcF0gPSBwYXJzZUZsb2F0KHByb3BlcnR5W3Byb3BdKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIF8uZWFjaChKc29uUmVmcy5maW5kUmVmcyhvUHJvcCwge1xuICAgICAgICBpbmNsdWRlSW52YWxpZDogdHJ1ZSxcbiAgICAgICAgcmVmUHJlUHJvY2Vzc29yOiBzd2FnZ2VyMVJlZlByZVByb2Nlc29yXG4gICAgICB9KSwgZnVuY3Rpb24gKHJlZkRldGFpbHMsIHJlZlB0cikge1xuICAgICAgICB2YXIgZE1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tyZWZEZXRhaWxzLnVyaV07XG4gICAgICAgIHZhciBwYXRoID0gSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKTtcblxuICAgICAgICBpZiAoZE1ldGFkYXRhLmxpbmVhZ2UubGVuZ3RoID4gMCkge1xuICAgICAgICAgIHRyYXZlcnNlKHByb3BlcnR5KS5zZXQocGF0aCwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIHJlZkRldGFpbHMudXJpKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJhdmVyc2UocHJvcGVydHkpLnNldChwYXRoLmNvbmNhdCgndGl0bGUnKSwgJ0NvbXBvc2VkICcgKyBzYW5pdGl6ZVJlZihkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVmRGV0YWlscy51cmkpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBTY3J1YiBpZCBwcm9wZXJ0aWVzXG4gIGNvbXBvc2VkID0gdHJhdmVyc2UoY29tcG9zZWQpLm1hcChmdW5jdGlvbiAodmFsKSB7XG4gICAgaWYgKHRoaXMua2V5ID09PSAnaWQnICYmIF8uaXNTdHJpbmcodmFsKSkge1xuICAgICAgdGhpcy5yZW1vdmUoKTtcbiAgICB9XG4gIH0pO1xuXG4gIGNvbXBvc2VkLnRpdGxlID0gdGl0bGU7XG5cbiAgcmV0dXJuIGNvbXBvc2VkO1xufTtcblxudmFyIGNyZWF0ZVVudXNlZEVycm9yT3JXYXJuaW5nID0gZnVuY3Rpb24gKHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdVTlVTRURfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgaXMgZGVmaW5lZCBidXQgaXMgbm90IHVzZWQ6ICcgKyB2YWwsIHBhdGgsIGRlc3QpO1xufTtcblxudmFyIGdldERvY3VtZW50Q2FjaGUgPSBmdW5jdGlvbiAoYXBpRE9yU08pIHtcbiAgdmFyIGtleSA9IFNwYXJrTUQ1Lmhhc2goSlNPTi5zdHJpbmdpZnkoYXBpRE9yU08pKTtcbiAgdmFyIGNhY2hlRW50cnkgPSBkb2N1bWVudENhY2hlW2tleV0gfHwgXy5maW5kKGRvY3VtZW50Q2FjaGUsIGZ1bmN0aW9uIChjYWNoZUVudHJ5KSB7XG4gICAgcmV0dXJuIGNhY2hlRW50cnkucmVzb2x2ZWRJZCA9PT0ga2V5O1xuICB9KTtcblxuICBpZiAoIWNhY2hlRW50cnkpIHtcbiAgICBjYWNoZUVudHJ5ID0gZG9jdW1lbnRDYWNoZVtrZXldID0ge1xuICAgICAgZGVmaW5pdGlvbnM6IHt9LFxuICAgICAgb3JpZ2luYWw6IGFwaURPclNPLFxuICAgICAgcmVzb2x2ZWQ6IHVuZGVmaW5lZCxcbiAgICAgIHN3YWdnZXJWZXJzaW9uOiBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKVxuICAgIH07XG4gIH1cblxuICByZXR1cm4gY2FjaGVFbnRyeTtcbn07XG5cbnZhciBoYW5kbGVWYWxpZGF0aW9uRXJyb3IgPSBmdW5jdGlvbiAocmVzdWx0cywgY2FsbGJhY2spIHtcbiAgdmFyIGVyciA9IG5ldyBFcnJvcignVGhlIFN3YWdnZXIgZG9jdW1lbnQocykgYXJlIGludmFsaWQnKTtcblxuICBlcnIuZXJyb3JzID0gcmVzdWx0cy5lcnJvcnM7XG4gIGVyci5mYWlsZWRWYWxpZGF0aW9uID0gdHJ1ZTtcbiAgZXJyLndhcm5pbmdzID0gcmVzdWx0cy53YXJuaW5ncztcblxuICBpZiAocmVzdWx0cy5hcGlEZWNsYXJhdGlvbnMpIHtcbiAgICBlcnIuYXBpRGVjbGFyYXRpb25zID0gcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnM7XG4gIH1cblxuICBjYWxsYmFjayhlcnIpO1xufTtcblxudmFyIG5vcm1hbGl6ZVBhdGggPSBmdW5jdGlvbiAocGF0aCkge1xuICB2YXIgbWF0Y2hlcyA9IHBhdGgubWF0Y2goL1xceyguKj8pXFx9L2cpO1xuICB2YXIgYXJnTmFtZXMgPSBbXTtcbiAgdmFyIG5vcm1QYXRoID0gcGF0aDtcblxuICBpZiAobWF0Y2hlcykge1xuICAgIF8uZWFjaChtYXRjaGVzLCBmdW5jdGlvbiAobWF0Y2gsIGluZGV4KSB7XG4gICAgICBub3JtUGF0aCA9IG5vcm1QYXRoLnJlcGxhY2UobWF0Y2gsICd7JyArIGluZGV4ICsgJ30nKTtcbiAgICAgIGFyZ05hbWVzLnB1c2gobWF0Y2gucmVwbGFjZSgvW3t9XS9nLCAnJykpO1xuICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBwYXRoOiBub3JtUGF0aCxcbiAgICBhcmdzOiBhcmdOYW1lc1xuICB9O1xufTtcblxudmFyIHJlbW92ZUNpcmN1bGFycyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgZnVuY3Rpb24gd2FsayAoYW5jZXN0b3JzLCBub2RlLCBwYXRoKSB7XG4gICAgZnVuY3Rpb24gd2Fsa0l0ZW0gKGl0ZW0sIHNlZ21lbnQpIHtcbiAgICAgIHBhdGgucHVzaChzZWdtZW50KTtcbiAgICAgIHdhbGsoYW5jZXN0b3JzLCBpdGVtLCBwYXRoKTtcbiAgICAgIHBhdGgucG9wKCk7XG4gICAgfVxuXG4gICAgLy8gV2UgZG8gbm90IHByb2Nlc3MgY2lyY3VsYXIgb2JqZWN0cyBhZ2FpblxuICAgIGlmIChhbmNlc3RvcnMuaW5kZXhPZihub2RlKSA9PT0gLTEpIHtcbiAgICAgIGFuY2VzdG9ycy5wdXNoKG5vZGUpO1xuXG4gICAgICBpZiAoXy5pc0FycmF5KG5vZGUpKSB7XG4gICAgICAgIF8uZWFjaChub2RlLCBmdW5jdGlvbiAobWVtYmVyLCBpbmRleCkge1xuICAgICAgICAgIHdhbGtJdGVtKG1lbWJlciwgaW5kZXgudG9TdHJpbmcoKSk7XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmIChfLmlzUGxhaW5PYmplY3Qobm9kZSkpIHtcbiAgICAgICAgXy5mb3JPd24obm9kZSwgZnVuY3Rpb24gKG1lbWJlciwga2V5KSB7XG4gICAgICAgICAgd2Fsa0l0ZW0obWVtYmVyLCBrZXkudG9TdHJpbmcoKSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBfLnNldChvYmosIHBhdGgsIHt9KTtcbiAgICB9XG5cbiAgICBhbmNlc3RvcnMucG9wKCk7XG4gIH1cblxuICB3YWxrKFtdLCBvYmosIFtdKTtcbn07XG5cblxudmFyIHZhbGlkYXRlTm9FeGlzdCA9IGZ1bmN0aW9uIChkYXRhLCB2YWwsIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCwgcGF0aCwgZGVzdCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoZGF0YSkgJiYgZGF0YS5pbmRleE9mKHZhbCkgPiAtMSkge1xuICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdEVVBMSUNBVEVfJyArIGNvZGVTdWZmaXgsIG1zZ1ByZWZpeCArICcgYWxyZWFkeSBkZWZpbmVkOiAnICsgdmFsLCBwYXRoLCBkZXN0KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMgPSBmdW5jdGlvbiAoZG9jdW1lbnRNZXRhZGF0YSwgc2NoZW1hLCBwYXRoLCByZXN1bHRzLCBza2lwKSB7XG4gIHRyeSB7XG4gICAgdmFsaWRhdG9ycy52YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24sIHNjaGVtYSwgcGF0aCwgdW5kZWZpbmVkKTtcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgaWYgKCFza2lwKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZyhlcnIuY29kZSwgZXJyLm1lc3NhZ2UsIGVyci5wYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuICB9XG59O1xuXG52YXIgcHJvY2Vzc0RvY3VtZW50ID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgdmFyIHN3YWdnZXJWZXJzaW9uID0gZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbjtcbiAgdmFyIGdldERlZmluaXRpb25NZXRhZGF0YSA9IGZ1bmN0aW9uIChkZWZQYXRoLCBpbmxpbmUpIHtcbiAgICB2YXIgZGVmUHRyID0gSnNvblJlZnMucGF0aFRvUHRyKGRlZlBhdGgpO1xuICAgIHZhciBtZXRhZGF0YSA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbZGVmUHRyXTtcblxuICAgIGlmICghbWV0YWRhdGEpIHtcbiAgICAgIG1ldGFkYXRhID0gZG9jdW1lbnRNZXRhZGF0YS5kZWZpbml0aW9uc1tkZWZQdHJdID0ge1xuICAgICAgICBpbmxpbmU6IGlubGluZSB8fCBmYWxzZSxcbiAgICAgICAgcmVmZXJlbmNlczogW11cbiAgICAgIH07XG5cbiAgICAgIC8vIEZvciBtb2RlbCBkZWZpbml0aW9ucywgYWRkIHRoZSBpbmhlcml0YW5jZSBwcm9wZXJ0aWVzXG4gICAgICBpZiAoWydkZWZpbml0aW9ucycsICdtb2RlbHMnXS5pbmRleE9mKEpzb25SZWZzLnBhdGhGcm9tUHRyKGRlZlB0cilbMF0pID4gLTEpIHtcbiAgICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBmYWxzZTtcbiAgICAgICAgbWV0YWRhdGEubGluZWFnZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgbWV0YWRhdGEucGFyZW50cyA9IFtdO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBtZXRhZGF0YTtcbiAgfTtcbiAgdmFyIGdldERpc3BsYXlJZCA9IGZ1bmN0aW9uIChpZCkge1xuICAgIHJldHVybiBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCkucG9wKCkgOiBpZDtcbiAgfTtcbiAgdmFyIGpzb25SZWZzT3B0aW9ucyA9IHtcbiAgICBmaWx0ZXI6ICdsb2NhbCcsXG4gICAgaW5jbHVkZUludmFsaWQ6IHRydWVcbiAgfTtcbiAgdmFyIHdhbGsgPSBmdW5jdGlvbiAocm9vdCwgaWQsIGxpbmVhZ2UpIHtcbiAgICB2YXIgZGVmaW5pdGlvbiA9IGRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbaWQgfHwgcm9vdF07XG5cbiAgICBpZiAoZGVmaW5pdGlvbikge1xuICAgICAgXy5lYWNoKGRlZmluaXRpb24ucGFyZW50cywgZnVuY3Rpb24gKHBhcmVudCkge1xuICAgICAgICBsaW5lYWdlLnB1c2gocGFyZW50KTtcblxuICAgICAgICBpZiAocm9vdCAhPT0gcGFyZW50KSB7XG4gICAgICAgICAgd2Fsayhyb290LCBwYXJlbnQsIGxpbmVhZ2UpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBhdXRoRGVmc1Byb3AgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnYXV0aG9yaXphdGlvbnMnIDogJ3NlY3VyaXR5RGVmaW5pdGlvbnMnO1xuICB2YXIgbW9kZWxEZWZzUHJvcCA9IHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdtb2RlbHMnIDogJ2RlZmluaXRpb25zJztcblxuICAvLyBQcm9jZXNzIGF1dGhvcml6YXRpb24gZGVmaW5pdGlvbnNcbiAgXy5lYWNoKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbYXV0aERlZnNQcm9wXSwgZnVuY3Rpb24gKGF1dGhvcml6YXRpb24sIG5hbWUpIHtcbiAgICB2YXIgc2VjdXJpdHlEZWZQYXRoID0gW2F1dGhEZWZzUHJvcCwgbmFtZV07XG5cbiAgICAvLyBTd2FnZ2VyIDEuMiBvbmx5IGhhcyBhdXRob3JpemF0aW9uIGRlZmluaXRpb25zIGluIHRoZSBSZXNvdXJjZSBMaXN0aW5nXG4gICAgaWYgKHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyAmJiAhYXV0aG9yaXphdGlvbi50eXBlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSBhdXRob3JpemF0aW9uIGRlZmluaXRpb24gbWV0YWRhdGFcbiAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoKTtcblxuICAgIF8ucmVkdWNlKGF1dGhvcml6YXRpb24uc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4T3JOYW1lKSB7XG4gICAgICB2YXIgc2NvcGVOYW1lID0gc3dhZ2dlclZlcnNpb24gPT09ICcxLjInID8gc2NvcGUuc2NvcGUgOiBpbmRleE9yTmFtZTtcbiAgICAgIHZhciBzY29wZURlZlBhdGggPSBzZWN1cml0eURlZlBhdGguY29uY2F0KFsnc2NvcGVzJywgaW5kZXhPck5hbWUudG9TdHJpbmcoKV0pO1xuICAgICAgdmFyIHNjb3BlTWV0YWRhdGEgPSBnZXREZWZpbml0aW9uTWV0YWRhdGEoc2VjdXJpdHlEZWZQYXRoLmNvbmNhdChbJ3Njb3BlcycsIHNjb3BlTmFtZV0pKTtcblxuICAgICAgc2NvcGVNZXRhZGF0YS5zY29wZVBhdGggPSBzY29wZURlZlBhdGg7XG5cbiAgICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBhdXRob3JpemF0aW9uIHNjb3BlIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuU2NvcGVzLCBzY29wZU5hbWUsICdBVVRIT1JJWkFUSU9OX1NDT1BFX0RFRklOSVRJT04nLCAnQXV0aG9yaXphdGlvbiBzY29wZSBkZWZpbml0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgICBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBzY29wZURlZlBhdGguY29uY2F0KCdzY29wZScpIDogc2NvcGVEZWZQYXRoLCByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgc2VlblNjb3Blcy5wdXNoKHNjb3BlTmFtZSk7XG5cbiAgICAgIHJldHVybiBzZWVuU2NvcGVzO1xuICAgIH0sIFtdKTtcbiAgfSk7XG5cbiAgLy8gUHJvY2VzcyBtb2RlbCBkZWZpbml0aW9uc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZFttb2RlbERlZnNQcm9wXSwgZnVuY3Rpb24gKG1vZGVsLCBtb2RlbElkKSB7XG4gICAgdmFyIG1vZGVsRGVmUGF0aCA9IFttb2RlbERlZnNQcm9wLCBtb2RlbElkXTtcbiAgICB2YXIgbW9kZWxNZXRhZGF0YSA9IGdldERlZmluaXRpb25NZXRhZGF0YShtb2RlbERlZlBhdGgpO1xuXG4gICAgLy8gSWRlbnRpZnkgbW9kZWwgaWQgbWlzbWF0Y2ggKElkIGluIG1vZGVscyBvYmplY3QgaXMgbm90IHRoZSBzYW1lIGFzIHRoZSBtb2RlbCdzIGlkIGluIHRoZSBtb2RlbHMgb2JqZWN0KVxuICAgIGlmIChzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgJiYgbW9kZWxJZCAhPT0gbW9kZWwuaWQpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNT0RFTF9JRF9NSVNNQVRDSCcsICdNb2RlbCBpZCBkb2VzIG5vdCBtYXRjaCBpZCBpbiBtb2RlbHMgb2JqZWN0OiAnICsgbW9kZWwuaWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RlbERlZlBhdGguY29uY2F0KCdpZCcpLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgLy8gRG8gbm90IHJlcHJvY2VzcyBwYXJlbnRzL3JlZmVyZW5jZXMgaWYgYWxyZWFkeSBwcm9jZXNzZWRcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbE1ldGFkYXRhLmxpbmVhZ2UpKSB7XG4gICAgICAvLyBIYW5kbGUgaW5oZXJpdGFuY2UgcmVmZXJlbmNlc1xuICAgICAgc3dpdGNoIChzd2FnZ2VyVmVyc2lvbikge1xuICAgICAgY2FzZSAnMS4yJzpcbiAgICAgICAgXy5lYWNoKG1vZGVsLnN1YlR5cGVzLCBmdW5jdGlvbiAoc3ViVHlwZSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgc3ViUGF0aCA9IFsnbW9kZWxzJywgc3ViVHlwZV07XG4gICAgICAgICAgdmFyIHN1YlB0ciA9IEpzb25SZWZzLnBhdGhUb1B0cihzdWJQYXRoKTtcbiAgICAgICAgICB2YXIgc3ViTWV0YWRhdGEgPSBkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zW3N1YlB0cl07XG4gICAgICAgICAgdmFyIHJlZlBhdGggPSBtb2RlbERlZlBhdGguY29uY2F0KFsnc3ViVHlwZXMnLCBpbmRleC50b1N0cmluZygpXSk7XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbWV0YWRhdGEgZG9lcyBub3QgeWV0IGV4aXN0LCBjcmVhdGUgaXRcbiAgICAgICAgICBpZiAoIXN1Yk1ldGFkYXRhICYmIGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWRbbW9kZWxEZWZzUHJvcF1bc3ViVHlwZV0pIHtcbiAgICAgICAgICAgIHN1Yk1ldGFkYXRhID0gZ2V0RGVmaW5pdGlvbk1ldGFkYXRhKHN1YlBhdGgpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHRoZSByZWZlcmVuY2UgaXMgdmFsaWQsIGFkZCB0aGUgcGFyZW50XG4gICAgICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzdWJQYXRoLCByZWZQYXRoLCByZXN1bHRzKSkge1xuICAgICAgICAgICAgc3ViTWV0YWRhdGEucGFyZW50cy5wdXNoKEpzb25SZWZzLnBhdGhUb1B0cihtb2RlbERlZlBhdGgpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5vcmlnaW5hbFttb2RlbERlZnNQcm9wXVttb2RlbElkXS5hbGxPZiwgZnVuY3Rpb24gKHNjaGVtYSwgaW5kZXgpIHtcbiAgICAgICAgICB2YXIgaXNJbmxpbmUgPSBmYWxzZTtcbiAgICAgICAgICB2YXIgcGFyZW50UGF0aDtcblxuICAgICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHNjaGVtYS4kcmVmKSB8fCBpc1JlbW90ZVB0cihKc29uUmVmcy5nZXRSZWZEZXRhaWxzKHNjaGVtYSkpKSB7XG4gICAgICAgICAgICBpc0lubGluZSA9IHRydWU7XG4gICAgICAgICAgICBwYXJlbnRQYXRoID0gbW9kZWxEZWZQYXRoLmNvbmNhdChbJ2FsbE9mJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwYXJlbnRQYXRoID0gSnNvblJlZnMucGF0aEZyb21QdHIoc2NoZW1hLiRyZWYpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIElmIHRoZSBwYXJlbnQgbW9kZWwgZG9lcyBub3QgZXhpc3QsIGRvIG5vdCBjcmVhdGUgaXRzIG1ldGFkYXRhXG4gICAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKHRyYXZlcnNlKGRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpLmdldChwYXJlbnRQYXRoKSkpIHtcbiAgICAgICAgICAgIC8vIENyZWF0ZSBtZXRhZGF0YSBmb3IgcGFyZW50XG4gICAgICAgICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGFyZW50UGF0aCwgaXNJbmxpbmUpO1xuXG4gICAgICAgICAgICBtb2RlbE1ldGFkYXRhLnBhcmVudHMucHVzaChKc29uUmVmcy5wYXRoVG9QdHIocGFyZW50UGF0aCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9KTtcblxuICBzd2l0Y2ggKHN3YWdnZXJWZXJzaW9uKSB7XG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gUHJvY2VzcyBwYXJhbWV0ZXIgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyLCBuYW1lKSB7XG4gICAgICB2YXIgcGF0aCA9IFsncGFyYW1ldGVycycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcGFyYW1ldGVyLCBwYXRoLCByZXN1bHRzKTtcbiAgICB9KTtcblxuICAgIC8vIFByb2Nlc3MgcmVzcG9uc2UgZGVmaW5pdGlvbnNcbiAgICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5yZXNwb25zZXMsIGZ1bmN0aW9uIChyZXNwb25zZSwgbmFtZSkge1xuICAgICAgdmFyIHBhdGggPSBbJ3Jlc3BvbnNlcycsIG5hbWVdO1xuXG4gICAgICBnZXREZWZpbml0aW9uTWV0YWRhdGEocGF0aCk7XG5cbiAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoZG9jdW1lbnRNZXRhZGF0YSwgcmVzcG9uc2UsIHBhdGgsIHJlc3VsdHMpO1xuICAgIH0pO1xuXG4gICAgYnJlYWs7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBkZWZpbml0aW9uL21vZGVscyAoSW5oZXJpdGFuY2UsIHByb3BlcnR5IGRlZmluaXRpb25zLCAuLi4pXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCk7XG4gICAgdmFyIGRlZmluaXRpb24gPSB0cmF2ZXJzZShkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsKS5nZXQoZGVmUGF0aCk7XG4gICAgdmFyIGRlZlByb3AgPSBkZWZQYXRoWzBdO1xuICAgIHZhciBjb2RlID0gZGVmUHJvcC5zdWJzdHJpbmcoMCwgZGVmUHJvcC5sZW5ndGggLSAxKS50b1VwcGVyQ2FzZSgpO1xuICAgIHZhciBtc2dQcmVmaXggPSBjb2RlLmNoYXJBdCgwKSArIGNvZGUuc3Vic3RyaW5nKDEpLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFyIGRQcm9wZXJ0aWVzO1xuICAgIHZhciBpUHJvcGVydGllcztcbiAgICB2YXIgbGluZWFnZTtcblxuICAgIC8vIFRoZSBvbmx5IGNoZWNrcyB3ZSBwZXJmb3JtIGJlbG93IGFyZSBpbmhlcml0YW5jZSBjaGVja3Mgc28gc2tpcCBhbGwgbm9uLW1vZGVsIGRlZmluaXRpb25zXG4gICAgaWYgKFsnZGVmaW5pdGlvbnMnLCAnbW9kZWxzJ10uaW5kZXhPZihkZWZQcm9wKSA9PT0gLTEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBkUHJvcGVydGllcyA9IFtdO1xuICAgIGlQcm9wZXJ0aWVzID0gW107XG4gICAgbGluZWFnZSA9IG1ldGFkYXRhLmxpbmVhZ2U7XG5cbiAgICAvLyBEbyBub3QgcmVwcm9jZXNzIGxpbmVhZ2UgaWYgYWxyZWFkeSBwcm9jZXNzZWRcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChsaW5lYWdlKSkge1xuICAgICAgbGluZWFnZSA9IFtdO1xuXG4gICAgICB3YWxrKGlkLCB1bmRlZmluZWQsIGxpbmVhZ2UpO1xuXG4gICAgICAvLyBSb290ID4gbmV4dCA+IC4uLlxuICAgICAgbGluZWFnZS5yZXZlcnNlKCk7XG5cbiAgICAgIG1ldGFkYXRhLmxpbmVhZ2UgPSBfLmNsb25lRGVlcChsaW5lYWdlKTtcblxuICAgICAgbWV0YWRhdGEuY3ljbGljYWwgPSBsaW5lYWdlLmxlbmd0aCA+IDEgJiYgbGluZWFnZVswXSA9PT0gaWQ7XG4gICAgfVxuXG4gICAgLy8gU3dhZ2dlciAxLjIgZG9lcyBub3QgYWxsb3cgbXVsdGlwbGUgaW5oZXJpdGFuY2Ugd2hpbGUgU3dhZ2dlciAyLjArIGRvZXNcbiAgICBpZiAobWV0YWRhdGEucGFyZW50cy5sZW5ndGggPiAxICYmIHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01VTFRJUExFXycgKyBjb2RlICsgJ19JTkhFUklUQU5DRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnQ2hpbGQgJyArIGNvZGUudG9Mb3dlckNhc2UoKSArICcgaXMgc3ViIHR5cGUgb2YgbXVsdGlwbGUgbW9kZWxzOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIF8ubWFwKG1ldGFkYXRhLnBhcmVudHMsIGZ1bmN0aW9uIChwYXJlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldERpc3BsYXlJZChwYXJlbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkuam9pbignICYmICcpLCBkZWZQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgaWYgKG1ldGFkYXRhLmN5Y2xpY2FsKSB7XG4gICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ1lDTElDQUxfJyArIGNvZGUgKyAnX0lOSEVSSVRBTkNFJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG1zZ1ByZWZpeCArICcgaGFzIGEgY2lyY3VsYXIgaW5oZXJpdGFuY2U6ICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLm1hcChsaW5lYWdlLCBmdW5jdGlvbiAoZGVwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldERpc3BsYXlJZChkZXApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KS5qb2luKCcgLT4gJykgKyAnIC0+ICcgKyBnZXREaXNwbGF5SWQoaWQpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlZlBhdGguY29uY2F0KHN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdzdWJUeXBlcycgOiAnYWxsT2YnKSwgcmVzdWx0cy5lcnJvcnMpO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSBzZWxmIHJlZmVyZW5jZSBmcm9tIHRoZSBlbmQgb2YgdGhlIGxpbmVhZ2UgKEZyb250IHRvbyBpZiBjeWNsaWNhbClcbiAgICBfLmVhY2gobGluZWFnZS5zbGljZShtZXRhZGF0YS5jeWNsaWNhbCA/IDEgOiAwKSwgZnVuY3Rpb24gKGlkKSB7XG4gICAgICB2YXIgcE1vZGVsID0gdHJhdmVyc2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCkuZ2V0KEpzb25SZWZzLnBhdGhGcm9tUHRyKGlkKSk7XG5cbiAgICAgIF8uZWFjaChPYmplY3Qua2V5cyhwTW9kZWwucHJvcGVydGllcyB8fCB7fSksIGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID09PSAtMSkge1xuICAgICAgICAgIGlQcm9wZXJ0aWVzLnB1c2gobmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gVmFsaWRhdGUgc2ltcGxlIGRlZmluaXRpb25zXG4gICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBkZWZpbml0aW9uLCBkZWZQYXRoLCByZXN1bHRzKTtcblxuICAgIC8vIElkZW50aWZ5IHJlZGVjbGFyZWQgcHJvcGVydGllc1xuICAgIF8uZWFjaChkZWZpbml0aW9uLnByb3BlcnRpZXMsIGZ1bmN0aW9uIChwcm9wZXJ0eSwgbmFtZSkge1xuICAgICAgdmFyIHBQYXRoID0gZGVmUGF0aC5jb25jYXQoWydwcm9wZXJ0aWVzJywgbmFtZV0pO1xuXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB1bnJlc29sdmVkIHByb3BlcnRpZXNcbiAgICAgIGlmICghXy5pc1VuZGVmaW5lZChwcm9wZXJ0eSkpIHtcbiAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyhkb2N1bWVudE1ldGFkYXRhLCBwcm9wZXJ0eSwgcFBhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAgIGlmIChpUHJvcGVydGllcy5pbmRleE9mKG5hbWUpID4gLTEpIHtcbiAgICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnQ0hJTERfJyArIGNvZGUgKyAnX1JFREVDTEFSRVNfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdDaGlsZCAnICsgY29kZS50b0xvd2VyQ2FzZSgpICsgJyBkZWNsYXJlcyBwcm9wZXJ0eSBhbHJlYWR5IGRlY2xhcmVkIGJ5IGFuY2VzdG9yOiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBQYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZFByb3BlcnRpZXMucHVzaChuYW1lKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSWRlbnRpZnkgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0aWVzXG4gICAgXy5lYWNoKGRlZmluaXRpb24ucmVxdWlyZWQgfHwgW10sIGZ1bmN0aW9uIChuYW1lLCBpbmRleCkge1xuICAgICAgdmFyIHR5cGUgPSBzd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyAnTW9kZWwnIDogJ0RlZmluaXRpb24nO1xuXG4gICAgICBpZiAoaVByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEgJiYgZFByb3BlcnRpZXMuaW5kZXhPZihuYW1lKSA9PT0gLTEpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ01JU1NJTkdfUkVRVUlSRURfJyArIHR5cGUudG9VcHBlckNhc2UoKSArICdfUFJPUEVSVFknLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlICsgJyByZXF1aXJlcyBwcm9wZXJ0eSBidXQgaXQgaXMgbm90IGRlZmluZWQ6ICcgKyBuYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZQYXRoLmNvbmNhdChbJ3JlcXVpcmVkJywgaW5kZXgudG9TdHJpbmcoKV0pLCByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xuXG4gIGlmIChkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJykge1xuICAgIGpzb25SZWZzT3B0aW9ucy5yZWZQcmVQcm9jZXNzb3IgPSBzd2FnZ2VyMVJlZlByZVByb2Nlc29yO1xuICB9XG5cbiAgLy8gUHJvY2VzcyBsb2NhbCByZWZlcmVuY2VzXG4gIF8uZWFjaChKc29uUmVmcy5maW5kUmVmcyhkb2N1bWVudE1ldGFkYXRhLm9yaWdpbmFsLCBqc29uUmVmc09wdGlvbnMpLCBmdW5jdGlvbiAocmVmRGV0YWlscywgcmVmUHRyKSB7XG4gICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsIHJlZkRldGFpbHMudXJpLCByZWZQdHIsIHJlc3VsdHMpO1xuICB9KTtcblxuICAvLyBQcm9jZXNzIGludmFsaWQgcmVmZXJlbmNlc1xuICBfLmVhY2goZG9jdW1lbnRNZXRhZGF0YS5yZWZlcmVuY2VzTWV0YWRhdGEsIGZ1bmN0aW9uIChyZWZEZXRhaWxzLCByZWZQdHIpIHtcbiAgICBpZiAoaXNSZW1vdGVQdHIocmVmRGV0YWlscykgJiYgcmVmRGV0YWlscy5taXNzaW5nID09PSB0cnVlKSB7XG4gICAgICByZXN1bHRzLmVycm9ycy5wdXNoKHtcbiAgICAgICAgY29kZTogJ1VOUkVTT0xWQUJMRV9SRUZFUkVOQ0UnLFxuICAgICAgICBtZXNzYWdlOiAnUmVmZXJlbmNlIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHNhbml0aXplUmVmKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24sIHJlZkRldGFpbHMudXJpKSxcbiAgICAgICAgcGF0aDogSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKS5jb25jYXQoJyRyZWYnKVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZUV4aXN0ID0gZnVuY3Rpb24gKGRhdGEsIHZhbCwgY29kZVN1ZmZpeCwgbXNnUHJlZml4LCBwYXRoLCBkZXN0KSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChkYXRhKSAmJiBkYXRhLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFXycgKyBjb2RlU3VmZml4LCBtc2dQcmVmaXggKyAnIGNvdWxkIG5vdCBiZSByZXNvbHZlZDogJyArIHZhbCwgcGF0aCwgZGVzdCk7XG4gIH1cbn07XG5cbnZhciBwcm9jZXNzQXV0aFJlZnMgPSBmdW5jdGlvbiAoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFJlZnMsIHBhdGgsIHJlc3VsdHMpIHtcbiAgdmFyIGNvZGUgPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/ICdBVVRIT1JJWkFUSU9OJyA6ICdTRUNVUklUWV9ERUZJTklUSU9OJztcbiAgdmFyIG1zZ1ByZWZpeCA9IGNvZGUgPT09ICdBVVRIT1JJWkFUSU9OJyA/ICdBdXRob3JpemF0aW9uJyA6ICdTZWN1cml0eSBkZWZpbml0aW9uJztcblxuICBpZiAoZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICBfLnJlZHVjZShhdXRoUmVmcywgZnVuY3Rpb24gKHNlZW5OYW1lcywgc2NvcGVzLCBuYW1lKSB7XG4gICAgICB2YXIgYXV0aFB0ciA9IFsnYXV0aG9yaXphdGlvbnMnLCBuYW1lXTtcbiAgICAgIHZhciBhUGF0aCA9IHBhdGguY29uY2F0KFtuYW1lXSk7XG5cbiAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvblxuICAgICAgaWYgKGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBhdXRoUHRyLCBhUGF0aCwgcmVzdWx0cykpIHtcbiAgICAgICAgXy5yZWR1Y2Uoc2NvcGVzLCBmdW5jdGlvbiAoc2VlblNjb3Blcywgc2NvcGUsIGluZGV4KSB7XG4gICAgICAgICAgdmFyIHNQYXRoID0gYVBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCksICdzY29wZScpO1xuICAgICAgICAgIHZhciBzUHRyID0gYXV0aFB0ci5jb25jYXQoWydzY29wZXMnLCBzY29wZS5zY29wZV0pO1xuXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5TY29wZXMsIHNjb3BlLnNjb3BlLCBjb2RlICsgJ19TQ09QRV9SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHNjb3BlIHJlZmVyZW5jZScsIHNQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLndhcm5pbmdzKTtcblxuICAgICAgICAgIC8vIEFkZCByZWZlcmVuY2Ugb3IgcmVjb3JkIHVucmVzb2x2ZWQgYXV0aG9yaXphdGlvbiBzY29wZVxuICAgICAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzUHRyLCBzUGF0aCwgcmVzdWx0cyk7XG5cbiAgICAgICAgICByZXR1cm4gc2VlblNjb3Blcy5jb25jYXQoc2NvcGUuc2NvcGUpO1xuICAgICAgICB9LCBbXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzZWVuTmFtZXMuY29uY2F0KG5hbWUpO1xuICAgIH0sIFtdKTtcbiAgfSBlbHNlIHtcbiAgICBfLnJlZHVjZShhdXRoUmVmcywgZnVuY3Rpb24gKHNlZW5OYW1lcywgc2NvcGVzLCBpbmRleCkge1xuICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlcywgbmFtZSkge1xuICAgICAgICB2YXIgYXV0aFB0ciA9IFsnc2VjdXJpdHlEZWZpbml0aW9ucycsIG5hbWVdO1xuICAgICAgICB2YXIgYXV0aFJlZlBhdGggPSBwYXRoLmNvbmNhdChpbmRleC50b1N0cmluZygpLCBuYW1lKTtcblxuICAgICAgICAvLyBFbnN1cmUgdGhlIHNlY3VyaXR5IGRlZmluaXRpb24gaXNuJ3QgcmVmZXJlbmNlZCBtb3JlIHRoYW4gb25jZSAoU3dhZ2dlciAyLjArKVxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk5hbWVzLCBuYW1lLCBjb2RlICsgJ19SRUZFUkVOQ0UnLCBtc2dQcmVmaXggKyAnIHJlZmVyZW5jZScsIGF1dGhSZWZQYXRoLFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy53YXJuaW5ncyk7XG5cbiAgICAgICAgc2Vlbk5hbWVzLnB1c2gobmFtZSk7XG5cbiAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uXG4gICAgICAgIGlmIChhZGRSZWZlcmVuY2UoZG9jdW1lbnRNZXRhZGF0YSwgYXV0aFB0ciwgYXV0aFJlZlBhdGgsIHJlc3VsdHMpKSB7XG4gICAgICAgICAgXy5lYWNoKHNjb3BlcywgZnVuY3Rpb24gKHNjb3BlLCBpbmRleCkge1xuICAgICAgICAgICAgLy8gQWRkIHJlZmVyZW5jZSBvciByZWNvcmQgdW5yZXNvbHZlZCBhdXRob3JpemF0aW9uIHNjb3BlXG4gICAgICAgICAgICB2YXIgc1B0ciA9IGF1dGhQdHIuY29uY2F0KFsnc2NvcGVzJywgc2NvcGVdKTtcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShkb2N1bWVudE1ldGFkYXRhLCBzUHRyLCBhdXRoUmVmUGF0aC5jb25jYXQoaW5kZXgudG9TdHJpbmcoKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gc2Vlbk5hbWVzO1xuICAgIH0sIFtdKTtcbiAgfVxufTtcblxudmFyIHJlc29sdmVSZWZzID0gZnVuY3Rpb24gKGFwaURPclNPLCBjYWxsYmFjaykge1xuICB2YXIgY2FjaGVFbnRyeSA9IGdldERvY3VtZW50Q2FjaGUoYXBpRE9yU08pO1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcbiAgdmFyIGpzb25SZWZzT3B0aW9ucyA9IHtcbiAgICBpbmNsdWRlSW52YWxpZDogdHJ1ZSxcbiAgICBsb2FkZXJPcHRpb25zOiB7XG4gICAgICBwcm9jZXNzQ29udGVudDogZnVuY3Rpb24gKHJlcywgY2FsbGJhY2spIHtcbiAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCBZQU1MLnNhZmVMb2FkKHJlcy50ZXh0KSk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGlmICghY2FjaGVFbnRyeS5yZXNvbHZlZCkge1xuICAgIC8vIEZvciBTd2FnZ2VyIDEuMiwgd2UgaGF2ZSB0byBjcmVhdGUgcmVhbCBKU09OIFJlZmVyZW5jZXNcbiAgICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBqc29uUmVmc09wdGlvbnMucmVmUHJlUHJvY2Vzc29yID0gc3dhZ2dlcjFSZWZQcmVQcm9jZXNvcjtcbiAgICB9XG5cbiAgICAvLyBSZXNvbHZlIHJlZmVyZW5jZXNcbiAgICBKc29uUmVmcy5yZXNvbHZlUmVmcyhhcGlET3JTTywganNvblJlZnNPcHRpb25zKVxuICAgICAgLnRoZW4oZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgICAgICAgcmVtb3ZlQ2lyY3VsYXJzKHJlc3VsdHMucmVzb2x2ZWQpO1xuXG4gICAgICAgIC8vIEZpeCBjaXJjdWxhciByZWZlcmVuY2VzXG4gICAgICAgIF8uZWFjaChyZXN1bHRzLnJlZnMsIGZ1bmN0aW9uIChyZWZEZXRhaWxzLCByZWZQdHIpIHtcbiAgICAgICAgICBpZiAocmVmRGV0YWlscy5jaXJjdWxhcikge1xuICAgICAgICAgICAgXy5zZXQocmVzdWx0cy5yZXNvbHZlZCwgSnNvblJlZnMucGF0aEZyb21QdHIocmVmUHRyKSwge30pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY2FjaGVFbnRyeS5yZWZlcmVuY2VzTWV0YWRhdGEgPSByZXN1bHRzLnJlZnM7XG4gICAgICAgIGNhY2hlRW50cnkucmVzb2x2ZWQgPSByZXN1bHRzLnJlc29sdmVkO1xuICAgICAgICBjYWNoZUVudHJ5LnJlc29sdmVkSWQgPSBTcGFya01ENS5oYXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdHMucmVzb2x2ZWQpKTtcblxuICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChjYWxsYmFjayk7XG4gIH0gZWxzZSB7XG4gICAgY2FsbGJhY2soKTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSA9IGZ1bmN0aW9uIChzcGVjLCBzY2hlbWFPck5hbWUsIGRhdGEsIGNhbGxiYWNrKSB7XG4gIHZhciB2YWxpZGF0b3IgPSBfLmlzU3RyaW5nKHNjaGVtYU9yTmFtZSkgPyBzcGVjLnZhbGlkYXRvcnNbc2NoZW1hT3JOYW1lXSA6IGhlbHBlcnMuY3JlYXRlSnNvblZhbGlkYXRvcigpO1xuXG4gIGhlbHBlcnMucmVnaXN0ZXJDdXN0b21Gb3JtYXRzKGRhdGEpO1xuXG4gIHRyeSB7XG4gICAgdmFsaWRhdG9ycy52YWxpZGF0ZUFnYWluc3RTY2hlbWEoc2NoZW1hT3JOYW1lLCBkYXRhLCB2YWxpZGF0b3IpO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBpZiAoZXJyLmZhaWxlZFZhbGlkYXRpb24pIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIGVyci5yZXN1bHRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycik7XG4gICAgfVxuICB9XG5cbiAgcmVzb2x2ZVJlZnMoZGF0YSwgZnVuY3Rpb24gKGVycikge1xuICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZURlZmluaXRpb25zID0gZnVuY3Rpb24gKGRvY3VtZW50TWV0YWRhdGEsIHJlc3VsdHMpIHtcbiAgLy8gVmFsaWRhdGUgdW51c2VkIGRlZmluaXRpb25zXG4gIF8uZWFjaChkb2N1bWVudE1ldGFkYXRhLmRlZmluaXRpb25zLCBmdW5jdGlvbiAobWV0YWRhdGEsIGlkKSB7XG4gICAgdmFyIGRlZlBhdGggPSBKc29uUmVmcy5wYXRoRnJvbVB0cihpZCk7XG4gICAgdmFyIGRlZlR5cGUgPSBkZWZQYXRoWzBdLnN1YnN0cmluZygwLCBkZWZQYXRoWzBdLmxlbmd0aCAtIDEpO1xuICAgIHZhciBkaXNwbGF5SWQgPSBkb2N1bWVudE1ldGFkYXRhLnN3YWdnZXJWZXJzaW9uID09PSAnMS4yJyA/IGRlZlBhdGhbZGVmUGF0aC5sZW5ndGggLSAxXSA6IGlkO1xuICAgIHZhciBjb2RlID0gZGVmVHlwZSA9PT0gJ3NlY3VyaXR5RGVmaW5pdGlvbicgPyAnU0VDVVJJVFlfREVGSU5JVElPTicgOiBkZWZUeXBlLnRvVXBwZXJDYXNlKCk7XG4gICAgdmFyIG1zZ1ByZWZpeCA9IGRlZlR5cGUgPT09ICdzZWN1cml0eURlZmluaXRpb24nID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1NlY3VyaXR5IGRlZmluaXRpb24nIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmVHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGRlZlR5cGUuc3Vic3RyaW5nKDEpO1xuXG4gICAgaWYgKG1ldGFkYXRhLnJlZmVyZW5jZXMubGVuZ3RoID09PSAwICYmICFtZXRhZGF0YS5pbmxpbmUpIHtcbiAgICAgIC8vIFN3YWdnZXIgMS4yIGF1dGhvcml6YXRpb24gc2NvcGVcbiAgICAgIGlmIChtZXRhZGF0YS5zY29wZVBhdGgpIHtcbiAgICAgICAgY29kZSArPSAnX1NDT1BFJztcbiAgICAgICAgbXNnUHJlZml4ICs9ICcgc2NvcGUnO1xuICAgICAgICBkZWZQYXRoID0gbWV0YWRhdGEuc2NvcGVQYXRoO1xuICAgICAgfVxuXG4gICAgICBjcmVhdGVVbnVzZWRFcnJvck9yV2FybmluZyhkaXNwbGF5SWQsIGNvZGUsIG1zZ1ByZWZpeCwgZGVmUGF0aCwgcmVzdWx0cy53YXJuaW5ncyk7XG4gICAgfVxuICB9KTtcbn07XG5cbnZhciB2YWxpZGF0ZVBhcmFtZXRlcnMgPSBmdW5jdGlvbiAoc3BlYywgZG9jdW1lbnRNZXRhZGF0YSwgblBhdGgsIHBhcmFtZXRlcnMsIHBhdGgsIHJlc3VsdHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNraXBNaXNzaW5nKSB7XG4gIHZhciBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yID0gZnVuY3Rpb24gKHBhdGgpIHtcbiAgICBjcmVhdGVFcnJvck9yV2FybmluZygnSU5WQUxJRF9QQVJBTUVURVJfQ09NQklOQVRJT04nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgY2Fubm90IGhhdmUgYSBhIGJvZHkgcGFyYW1ldGVyIGFuZCBhICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicgPyAnZm9ybScgOiAnZm9ybURhdGEnKSArICcgcGFyYW1ldGVyJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLCByZXN1bHRzLmVycm9ycyk7XG4gIH07XG4gIHZhciBwYXRoUGFyYW1zID0gW107XG4gIHZhciBzZWVuQm9keVBhcmFtID0gZmFsc2U7XG4gIHZhciBzZWVuRm9ybVBhcmFtID0gZmFsc2U7XG5cbiAgXy5yZWR1Y2UocGFyYW1ldGVycywgZnVuY3Rpb24gKHNlZW5QYXJhbWV0ZXJzLCBwYXJhbWV0ZXIsIGluZGV4KSB7XG4gICAgdmFyIHBQYXRoID0gcGF0aC5jb25jYXQoWydwYXJhbWV0ZXJzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgLy8gVW5yZXNvbHZlZCBwYXJhbWV0ZXJcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHBhcmFtZXRlciBuYW1lc1xuICAgIHZhbGlkYXRlTm9FeGlzdChzZWVuUGFyYW1ldGVycywgcGFyYW1ldGVyLm5hbWUsICdQQVJBTUVURVInLCAnUGFyYW1ldGVyJywgcFBhdGguY29uY2F0KCduYW1lJyksXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgIC8vIEtlZXAgdHJhY2sgb2YgYm9keSBhbmQgcGF0aCBwYXJhbWV0ZXJzXG4gICAgaWYgKHBhcmFtZXRlci5wYXJhbVR5cGUgPT09ICdib2R5JyB8fCBwYXJhbWV0ZXIuaW4gPT09ICdib2R5Jykge1xuICAgICAgaWYgKHNlZW5Cb2R5UGFyYW0gPT09IHRydWUpIHtcbiAgICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfQk9EWV9QQVJBTUVURVInLCAnQVBJIGhhcyBtb3JlIHRoYW4gb25lIGJvZHkgcGFyYW1ldGVyJywgcFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VlbkZvcm1QYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcbiAgICAgIH1cblxuICAgICAgc2VlbkJvZHlQYXJhbSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAnZm9ybScgfHwgcGFyYW1ldGVyLmluID09PSAnZm9ybURhdGEnKSB7XG4gICAgICBpZiAoc2VlbkJvZHlQYXJhbSA9PT0gdHJ1ZSkge1xuICAgICAgICBjcmVhdGVQYXJhbWV0ZXJDb21ib0Vycm9yKHBQYXRoKTtcbiAgICAgIH1cblxuICAgICAgc2VlbkZvcm1QYXJhbSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbWV0ZXIucGFyYW1UeXBlID09PSAncGF0aCcgfHwgcGFyYW1ldGVyLmluID09PSAncGF0aCcpIHtcbiAgICAgIGlmIChuUGF0aC5hcmdzLmluZGV4T2YocGFyYW1ldGVyLm5hbWUpID09PSAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnVU5SRVNPTFZBQkxFX0FQSV9QQVRIX1BBUkFNRVRFUicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICdBUEkgcGF0aCBwYXJhbWV0ZXIgY291bGQgbm90IGJlIHJlc29sdmVkOiAnICsgcGFyYW1ldGVyLm5hbWUsIHBQYXRoLmNvbmNhdCgnbmFtZScpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgICB9XG5cbiAgICAgIHBhdGhQYXJhbXMucHVzaChwYXJhbWV0ZXIubmFtZSk7XG4gICAgfVxuXG4gICAgaWYgKHNwZWMucHJpbWl0aXZlcy5pbmRleE9mKHBhcmFtZXRlci50eXBlKSA9PT0gLTEgJiYgc3BlYy52ZXJzaW9uID09PSAnMS4yJykge1xuICAgICAgYWRkUmVmZXJlbmNlKGRvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcGFyYW1ldGVyLnR5cGUsIHBQYXRoLmNvbmNhdCgndHlwZScpLCByZXN1bHRzKTtcbiAgICB9XG5cbiAgICAvLyBWYWxpZGF0ZSBwYXJhbWV0ZXIgY29uc3RyYWludHNcbiAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHBhcmFtZXRlciwgcFBhdGgsIHJlc3VsdHMsIHBhcmFtZXRlci5za2lwRXJyb3JzKTtcblxuICAgIHJldHVybiBzZWVuUGFyYW1ldGVycy5jb25jYXQocGFyYW1ldGVyLm5hbWUpO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgbWlzc2luZyBwYXRoIHBhcmFtZXRlcnMgKGluIHBhdGggYnV0IG5vdCBpbiBvcGVyYXRpb24ucGFyYW1ldGVycylcbiAgaWYgKF8uaXNVbmRlZmluZWQoc2tpcE1pc3NpbmcpIHx8IHNraXBNaXNzaW5nID09PSBmYWxzZSkge1xuICAgIF8uZWFjaChfLmRpZmZlcmVuY2UoblBhdGguYXJncywgcGF0aFBhcmFtcyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICAgIGNyZWF0ZUVycm9yT3JXYXJuaW5nKCdNSVNTSU5HX0FQSV9QQVRIX1BBUkFNRVRFUicsICdBUEkgcmVxdWlyZXMgcGF0aCBwYXJhbWV0ZXIgYnV0IGl0IGlzIG5vdCBkZWZpbmVkOiAnICsgdW51c2VkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgZG9jdW1lbnRNZXRhZGF0YS5zd2FnZ2VyVmVyc2lvbiA9PT0gJzEuMicgPyBwYXRoLnNsaWNlKDAsIDIpLmNvbmNhdCgncGF0aCcpIDogcGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcbiAgICB9KTtcbiAgfVxufTtcblxudmFyIHZhbGlkYXRlU3dhZ2dlcjFfMiA9IGZ1bmN0aW9uIChzcGVjLCByZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIHZhciBhZFJlc291cmNlUGF0aHMgPSBbXTtcbiAgdmFyIHJsRG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUocmVzb3VyY2VMaXN0aW5nKTtcbiAgdmFyIHJsUmVzb3VyY2VQYXRocyA9IFtdO1xuICB2YXIgcmVzdWx0cyA9IHtcbiAgICBlcnJvcnM6IFtdLFxuICAgIHdhcm5pbmdzOiBbXSxcbiAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXG4gIH07XG5cbiAgLy8gUHJvY2VzcyBSZXNvdXJjZSBMaXN0aW5nIHJlc291cmNlIGRlZmluaXRpb25zXG4gIHJsUmVzb3VyY2VQYXRocyA9IF8ucmVkdWNlKHJlc291cmNlTGlzdGluZy5hcGlzLCBmdW5jdGlvbiAoc2VlblBhdGhzLCBhcGksIGluZGV4KSB7XG4gICAgLy8gSWRlbnRpZnkgZHVwbGljYXRlIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgICB2YWxpZGF0ZU5vRXhpc3Qoc2VlblBhdGhzLCBhcGkucGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sXG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdHMuZXJyb3JzKTtcblxuICAgIHNlZW5QYXRocy5wdXNoKGFwaS5wYXRoKTtcblxuICAgIHJldHVybiBzZWVuUGF0aHM7XG4gIH0sIFtdKTtcblxuICAvLyBQcm9jZXNzIFJlc291cmNlIExpc3RpbmcgZGVmaW5pdGlvbnMgKGF1dGhvcml6YXRpb25zKVxuICBwcm9jZXNzRG9jdW1lbnQocmxEb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuXG4gIC8vIFByb2Nlc3MgZWFjaCBBUEkgRGVjbGFyYXRpb25cbiAgYWRSZXNvdXJjZVBhdGhzID0gXy5yZWR1Y2UoYXBpRGVjbGFyYXRpb25zLCBmdW5jdGlvbiAoc2VlblJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLCBpbmRleCkge1xuICAgIHZhciBhUmVzdWx0cyA9IHJlc3VsdHMuYXBpRGVjbGFyYXRpb25zW2luZGV4XSA9IHtcbiAgICAgIGVycm9yczogW10sXG4gICAgICB3YXJuaW5nczogW11cbiAgICB9O1xuICAgIHZhciBhZERvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKGFwaURlY2xhcmF0aW9uKTtcblxuICAgIC8vIElkZW50aWZ5IGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRocyBkZWZpbmVkIGluIHRoZSBBUEkgRGVjbGFyYXRpb25zXG4gICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNvdXJjZVBhdGhzLCBhcGlEZWNsYXJhdGlvbi5yZXNvdXJjZVBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICBbJ3Jlc291cmNlUGF0aCddLCBhUmVzdWx0cy5lcnJvcnMpO1xuXG4gICAgaWYgKGFkUmVzb3VyY2VQYXRocy5pbmRleE9mKGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCkgPT09IC0xKSB7XG4gICAgICAvLyBJZGVudGlmeSB1bnVzZWQgcmVzb3VyY2UgcGF0aHMgZGVmaW5lZCBpbiB0aGUgQVBJIERlY2xhcmF0aW9uc1xuICAgICAgdmFsaWRhdGVFeGlzdChybFJlc291cmNlUGF0aHMsIGFwaURlY2xhcmF0aW9uLnJlc291cmNlUGF0aCwgJ1JFU09VUkNFX1BBVEgnLCAnUmVzb3VyY2UgcGF0aCcsXG4gICAgICAgICAgICAgICAgICAgIFsncmVzb3VyY2VQYXRoJ10sIGFSZXN1bHRzLmVycm9ycyk7XG5cbiAgICAgIHNlZW5SZXNvdXJjZVBhdGhzLnB1c2goYXBpRGVjbGFyYXRpb24ucmVzb3VyY2VQYXRoKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBQcm9jZXNzIGF1dGhvcml6YXRpb24gcmVmZXJlbmNlc1xuICAgIC8vIE5vdCBwb3NzaWJsZSBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTU5XG5cbiAgICAvLyBQcm9jZXNzIG1vZGVsc1xuICAgIHByb2Nlc3NEb2N1bWVudChhZERvY3VtZW50TWV0YWRhdGEsIGFSZXN1bHRzKTtcblxuICAgIC8vIFByb2Nlc3MgdGhlIEFQSSBkZWZpbml0aW9uc1xuICAgIF8ucmVkdWNlKGFwaURlY2xhcmF0aW9uLmFwaXMsIGZ1bmN0aW9uIChzZWVuUGF0aHMsIGFwaSwgaW5kZXgpIHtcbiAgICAgIHZhciBhUGF0aCA9IFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCldO1xuICAgICAgdmFyIG5QYXRoID0gbm9ybWFsaXplUGF0aChhcGkucGF0aCk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIGR1cGxpY2F0ZSByZXNvdXJjZSBwYXRoXG4gICAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgICBjcmVhdGVFcnJvck9yV2FybmluZygnRFVQTElDQVRFX0FQSV9QQVRIJywgJ0FQSSBwYXRoIChvciBlcXVpdmFsZW50KSBhbHJlYWR5IGRlZmluZWQ6ICcgKyBhcGkucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVBhdGguY29uY2F0KCdwYXRoJyksIGFSZXN1bHRzLmVycm9ycyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzZWVuUGF0aHMucHVzaChuUGF0aC5wYXRoKTtcbiAgICAgIH1cblxuICAgICAgLy8gUHJvY2VzcyB0aGUgQVBJIG9wZXJhdGlvbnNcbiAgICAgIF8ucmVkdWNlKGFwaS5vcGVyYXRpb25zLCBmdW5jdGlvbiAoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbiwgaW5kZXgpIHtcbiAgICAgICAgdmFyIG9QYXRoID0gYVBhdGguY29uY2F0KFsnb3BlcmF0aW9ucycsIGluZGV4LnRvU3RyaW5nKCldKTtcblxuICAgICAgICAvLyBWYWxpZGF0ZSBkdXBsaWNhdGUgb3BlcmF0aW9uIG1ldGhvZFxuICAgICAgICB2YWxpZGF0ZU5vRXhpc3Qoc2Vlbk1ldGhvZHMsIG9wZXJhdGlvbi5tZXRob2QsICdPUEVSQVRJT05fTUVUSE9EJywgJ09wZXJhdGlvbiBtZXRob2QnLCBvUGF0aC5jb25jYXQoJ21ldGhvZCcpLFxuICAgICAgICAgICAgICAgICAgICAgICAgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIHRoZSBzZWVuIG1ldGhvZHNcbiAgICAgICAgc2Vlbk1ldGhvZHMucHVzaChvcGVyYXRpb24ubWV0aG9kKTtcblxuICAgICAgICAvLyBLZWVwIHRyYWNrIG9mIG9wZXJhdGlvbiB0eXBlc1xuICAgICAgICBpZiAoc3BlYy5wcmltaXRpdmVzLmluZGV4T2Yob3BlcmF0aW9uLnR5cGUpID09PSAtMSAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgYWRkUmVmZXJlbmNlKGFkRG9jdW1lbnRNZXRhZGF0YSwgJyMvbW9kZWxzLycgKyBvcGVyYXRpb24udHlwZSwgb1BhdGguY29uY2F0KCd0eXBlJyksIGFSZXN1bHRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByb2Nlc3MgYXV0aG9yaXphdGlvbiByZWZlcmVuY2VzXG4gICAgICAgIHByb2Nlc3NBdXRoUmVmcyhybERvY3VtZW50TWV0YWRhdGEsIG9wZXJhdGlvbi5hdXRob3JpemF0aW9ucywgb1BhdGguY29uY2F0KCdhdXRob3JpemF0aW9ucycpLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdmFsaWRhdGUgaW5saW5lIGNvbnN0cmFpbnRzXG4gICAgICAgIHZhbGlkYXRlU2NoZW1hQ29uc3RyYWludHMoYWREb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24sIG9QYXRoLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgICAgICB2YWxpZGF0ZVBhcmFtZXRlcnMoc3BlYywgYWREb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgb3BlcmF0aW9uLnBhcmFtZXRlcnMsIG9QYXRoLCBhUmVzdWx0cyk7XG5cbiAgICAgICAgLy8gVmFsaWRhdGUgdW5pcXVlIHJlc3BvbnNlIGNvZGVcbiAgICAgICAgXy5yZWR1Y2Uob3BlcmF0aW9uLnJlc3BvbnNlTWVzc2FnZXMsIGZ1bmN0aW9uIChzZWVuUmVzcG9uc2VDb2RlcywgcmVzcG9uc2VNZXNzYWdlLCBpbmRleCkge1xuICAgICAgICAgIHZhciBybVBhdGggPSBvUGF0aC5jb25jYXQoWydyZXNwb25zZU1lc3NhZ2VzJywgaW5kZXgudG9TdHJpbmcoKV0pO1xuXG4gICAgICAgICAgdmFsaWRhdGVOb0V4aXN0KHNlZW5SZXNwb25zZUNvZGVzLCByZXNwb25zZU1lc3NhZ2UuY29kZSwgJ1JFU1BPTlNFX01FU1NBR0VfQ09ERScsICdSZXNwb25zZSBtZXNzYWdlIGNvZGUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBybVBhdGguY29uY2F0KFsnY29kZSddKSwgYVJlc3VsdHMuZXJyb3JzKTtcblxuICAgICAgICAgIC8vIFZhbGlkYXRlIG1pc3NpbmcgbW9kZWxcbiAgICAgICAgICBpZiAocmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwpIHtcbiAgICAgICAgICAgIGFkZFJlZmVyZW5jZShhZERvY3VtZW50TWV0YWRhdGEsICcjL21vZGVscy8nICsgcmVzcG9uc2VNZXNzYWdlLnJlc3BvbnNlTW9kZWwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgcm1QYXRoLmNvbmNhdCgncmVzcG9uc2VNb2RlbCcpLCBhUmVzdWx0cyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHNlZW5SZXNwb25zZUNvZGVzLmNvbmNhdChyZXNwb25zZU1lc3NhZ2UuY29kZSk7XG4gICAgICAgIH0sIFtdKTtcblxuICAgICAgICByZXR1cm4gc2Vlbk1ldGhvZHM7XG4gICAgICB9LCBbXSk7XG5cbiAgICAgIHJldHVybiBzZWVuUGF0aHM7XG4gICAgfSwgW10pO1xuXG4gICAgLy8gVmFsaWRhdGUgQVBJIERlY2xhcmF0aW9uIGRlZmluaXRpb25zXG4gICAgdmFsaWRhdGVEZWZpbml0aW9ucyhhZERvY3VtZW50TWV0YWRhdGEsIGFSZXN1bHRzKTtcblxuICAgIHJldHVybiBzZWVuUmVzb3VyY2VQYXRocztcbiAgfSwgW10pO1xuXG4gIC8vIFZhbGlkYXRlIEFQSSBEZWNsYXJhdGlvbiBkZWZpbml0aW9uc1xuICB2YWxpZGF0ZURlZmluaXRpb25zKHJsRG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgLy8gSWRlbnRpZnkgdW51c2VkIHJlc291cmNlIHBhdGhzIGRlZmluZWQgaW4gdGhlIFJlc291cmNlIExpc3RpbmdcbiAgXy5lYWNoKF8uZGlmZmVyZW5jZShybFJlc291cmNlUGF0aHMsIGFkUmVzb3VyY2VQYXRocyksIGZ1bmN0aW9uICh1bnVzZWQpIHtcbiAgICB2YXIgaW5kZXggPSBybFJlc291cmNlUGF0aHMuaW5kZXhPZih1bnVzZWQpO1xuXG4gICAgY3JlYXRlVW51c2VkRXJyb3JPcldhcm5pbmcocmVzb3VyY2VMaXN0aW5nLmFwaXNbaW5kZXhdLnBhdGgsICdSRVNPVVJDRV9QQVRIJywgJ1Jlc291cmNlIHBhdGgnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsnYXBpcycsIGluZGV4LnRvU3RyaW5nKCksICdwYXRoJ10sIHJlc3VsdHMuZXJyb3JzKTtcbiAgfSk7XG5cbiAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbn07XG5cbnZhciB2YWxpZGF0ZVN3YWdnZXIyXzAgPSBmdW5jdGlvbiAoc3BlYywgc3dhZ2dlck9iamVjdCwgY2FsbGJhY2spIHsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4gIHZhciBkb2N1bWVudE1ldGFkYXRhID0gZ2V0RG9jdW1lbnRDYWNoZShzd2FnZ2VyT2JqZWN0KTtcbiAgdmFyIHJlc3VsdHMgPSB7XG4gICAgZXJyb3JzOiBbXSxcbiAgICB3YXJuaW5nczogW11cbiAgfTtcblxuICAvLyBQcm9jZXNzIGRlZmluaXRpb25zXG4gIHByb2Nlc3NEb2N1bWVudChkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcbiAgcHJvY2Vzc0F1dGhSZWZzKGRvY3VtZW50TWV0YWRhdGEsIHN3YWdnZXJPYmplY3Quc2VjdXJpdHksIFsnc2VjdXJpdHknXSwgcmVzdWx0cyk7XG5cbiAgXy5yZWR1Y2UoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZC5wYXRocywgZnVuY3Rpb24gKHNlZW5QYXRocywgcGF0aCwgbmFtZSkge1xuICAgIHZhciBwUGF0aCA9IFsncGF0aHMnLCBuYW1lXTtcbiAgICB2YXIgblBhdGggPSBub3JtYWxpemVQYXRoKG5hbWUpO1xuXG4gICAgLy8gVmFsaWRhdGUgZHVwbGljYXRlIHJlc291cmNlIHBhdGhcbiAgICBpZiAoc2VlblBhdGhzLmluZGV4T2YoblBhdGgucGF0aCkgPiAtMSkge1xuICAgICAgY3JlYXRlRXJyb3JPcldhcm5pbmcoJ0RVUExJQ0FURV9BUElfUEFUSCcsICdBUEkgcGF0aCAob3IgZXF1aXZhbGVudCkgYWxyZWFkeSBkZWZpbmVkOiAnICsgbmFtZSwgcFBhdGgsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRzLmVycm9ycyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgcGFyYW1ldGVyc1xuICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgcGF0aC5wYXJhbWV0ZXJzLCBwUGF0aCwgcmVzdWx0cywgdHJ1ZSk7XG5cbiAgICAvLyBWYWxpZGF0ZSB0aGUgT3BlcmF0aW9uc1xuICAgIF8uZWFjaChwYXRoLCBmdW5jdGlvbiAob3BlcmF0aW9uLCBtZXRob2QpIHtcbiAgICAgIHZhciBjUGFyYW1zID0gW107XG4gICAgICB2YXIgb1BhdGggPSBwUGF0aC5jb25jYXQobWV0aG9kKTtcbiAgICAgIHZhciBzZWVuUGFyYW1zID0gW107XG5cbiAgICAgIGlmICh2YWxpZE9wdGlvbk5hbWVzLmluZGV4T2YobWV0aG9kKSA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBQcm9jZXNzIHNlY3VyaXR5IHJlZmVyZW5jZXNcbiAgICAgIHByb2Nlc3NBdXRoUmVmcyhkb2N1bWVudE1ldGFkYXRhLCBvcGVyYXRpb24uc2VjdXJpdHksIG9QYXRoLmNvbmNhdCgnc2VjdXJpdHknKSwgcmVzdWx0cyk7XG5cbiAgICAgIC8vIENvbXBvc2UgcGFyYW1ldGVycyBmcm9tIHBhdGggZ2xvYmFsIHBhcmFtZXRlcnMgYW5kIG9wZXJhdGlvbiBwYXJhbWV0ZXJzXG4gICAgICBfLmVhY2gob3BlcmF0aW9uLnBhcmFtZXRlcnMsIGZ1bmN0aW9uIChwYXJhbWV0ZXIpIHtcbiAgICAgICAgLy8gQ2FuIGhhcHBlbiB3aXRoIGludmFsaWQgcmVmZXJlbmNlc1xuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJhbWV0ZXIpKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY1BhcmFtcy5wdXNoKHBhcmFtZXRlcik7XG5cbiAgICAgICAgc2VlblBhcmFtcy5wdXNoKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKTtcbiAgICAgIH0pO1xuXG4gICAgICBfLmVhY2gocGF0aC5wYXJhbWV0ZXJzLCBmdW5jdGlvbiAocGFyYW1ldGVyKSB7XG4gICAgICAgIHZhciBjbG9uZWQgPSBfLmNsb25lRGVlcChwYXJhbWV0ZXIpO1xuXG4gICAgICAgIC8vIFRoZSBvbmx5IGVycm9ycyB0aGF0IGNhbiBvY2N1ciBoZXJlIGFyZSBzY2hlbWEgY29uc3RyYWludCB2YWxpZGF0aW9uIGVycm9ycyB3aGljaCBhcmUgYWxyZWFkeSByZXBvcnRlZCBhYm92ZVxuICAgICAgICAvLyBzbyBkbyBub3QgcmVwb3J0IHRoZW0gYWdhaW4uXG4gICAgICAgIGNsb25lZC5za2lwRXJyb3JzID0gdHJ1ZTtcblxuICAgICAgICBpZiAoc2VlblBhcmFtcy5pbmRleE9mKHBhcmFtZXRlci5uYW1lICsgJzonICsgcGFyYW1ldGVyLmluKSA9PT0gLTEpIHtcbiAgICAgICAgICBjUGFyYW1zLnB1c2goY2xvbmVkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFZhbGlkYXRlIHBhcmFtZXRlcnNcbiAgICAgIHZhbGlkYXRlUGFyYW1ldGVycyhzcGVjLCBkb2N1bWVudE1ldGFkYXRhLCBuUGF0aCwgY1BhcmFtcywgb1BhdGgsIHJlc3VsdHMpO1xuXG4gICAgICAvLyBWYWxpZGF0ZSByZXNwb25zZXNcbiAgICAgIF8uZWFjaChvcGVyYXRpb24ucmVzcG9uc2VzLCBmdW5jdGlvbiAocmVzcG9uc2UsIHJlc3BvbnNlQ29kZSkge1xuICAgICAgICAvLyBEbyBub3QgcHJvY2VzcyByZWZlcmVuY2VzIHRvIG1pc3NpbmcgcmVzcG9uc2VzXG4gICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChyZXNwb25zZSkpIHtcbiAgICAgICAgICAvLyBWYWxpZGF0ZSB2YWxpZGF0ZSBpbmxpbmUgY29uc3RyYWludHNcbiAgICAgICAgICB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzKGRvY3VtZW50TWV0YWRhdGEsIHJlc3BvbnNlLCBvUGF0aC5jb25jYXQoJ3Jlc3BvbnNlcycsIHJlc3BvbnNlQ29kZSksIHJlc3VsdHMpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJldHVybiBzZWVuUGF0aHMuY29uY2F0KG5QYXRoLnBhdGgpO1xuICB9LCBbXSk7XG5cbiAgLy8gVmFsaWRhdGUgZGVmaW5pdGlvbnNcbiAgdmFsaWRhdGVEZWZpbml0aW9ucyhkb2N1bWVudE1ldGFkYXRhLCByZXN1bHRzKTtcblxuICBjYWxsYmFjayh1bmRlZmluZWQsIHJlc3VsdHMpO1xufTtcblxudmFyIHZhbGlkYXRlU2VtYW50aWNhbGx5ID0gZnVuY3Rpb24gKHNwZWMsIHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICB2YXIgY2JXcmFwcGVyID0gZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgIGNhbGxiYWNrKGVyciwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdHMpKTtcbiAgfTtcbiAgaWYgKHNwZWMudmVyc2lvbiA9PT0gJzEuMicpIHtcbiAgICB2YWxpZGF0ZVN3YWdnZXIxXzIoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB9IGVsc2Uge1xuICAgIHZhbGlkYXRlU3dhZ2dlcjJfMChzcGVjLCBybE9yU08sIGNiV3JhcHBlcik7IC8vIGpzaGludCBpZ25vcmU6bGluZVxuICB9XG59O1xuXG52YXIgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkgPSBmdW5jdGlvbiAoc3BlYywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKSB7XG4gIHZhbGlkYXRlQWdhaW5zdFNjaGVtYShzcGVjLCBzcGVjLnZlcnNpb24gPT09ICcxLjInID8gJ3Jlc291cmNlTGlzdGluZy5qc29uJyA6ICdzY2hlbWEuanNvbicsIHJsT3JTTyxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChlcnIsIHJlc3VsdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gT25seSB2YWxpZGF0ZSB0aGUgQVBJIERlY2xhcmF0aW9ucyBpZiB0aGUgQVBJIGlzIDEuMiBhbmQgdGhlIFJlc291cmNlIExpc3Rpbmcgd2FzIHZhbGlkXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0cyAmJiBzcGVjLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9yczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3YXJuaW5nczogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcGlEZWNsYXJhdGlvbnM6IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFzeW5jLm1hcChhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2syKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWxpZGF0ZUFnYWluc3RTY2hlbWEoc3BlYywgJ2FwaURlY2xhcmF0aW9uLmpzb24nLCBhcGlEZWNsYXJhdGlvbiwgY2FsbGJhY2syKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBmdW5jdGlvbiAoZXJyLCBhbGxSZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmVhY2goYWxsUmVzdWx0cywgZnVuY3Rpb24gKHJlc3VsdCwgaW5kZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0cy5hcGlEZWNsYXJhdGlvbnNbaW5kZXhdID0gcmVzdWx0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgcmVzdWx0cyk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCByZXN1bHRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgU3dhZ2dlciBzcGVjaWZpY2F0aW9uIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIFNwZWNpZmljYXRpb24gPSBmdW5jdGlvbiAodmVyc2lvbikge1xuICB2YXIgdGhhdCA9IHRoaXM7XG4gIHZhciBjcmVhdGVWYWxpZGF0b3JzID0gZnVuY3Rpb24gKHNwZWMsIHZhbGlkYXRvcnNNYXApIHtcbiAgICByZXR1cm4gXy5yZWR1Y2UodmFsaWRhdG9yc01hcCwgZnVuY3Rpb24gKHJlc3VsdCwgc2NoZW1hcywgc2NoZW1hTmFtZSkge1xuICAgICAgcmVzdWx0W3NjaGVtYU5hbWVdID0gaGVscGVycy5jcmVhdGVKc29uVmFsaWRhdG9yKHNjaGVtYXMpO1xuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH0sIHt9KTtcbiAgfTtcbiAgdmFyIGZpeFNjaGVtYUlkID0gZnVuY3Rpb24gKHNjaGVtYU5hbWUpIHtcbiAgICAvLyBTd2FnZ2VyIDEuMiBzY2hlbWEgZmlsZXMgdXNlIG9uZSBpZCBidXQgdXNlIGEgZGlmZmVyZW50IGlkIHdoZW4gcmVmZXJlbmNpbmcgc2NoZW1hIGZpbGVzLiAgV2UgYWxzbyB1c2UgdGhlIHNjaGVtYVxuICAgIC8vIGZpbGUgbmFtZSB0byByZWZlcmVuY2UgdGhlIHNjaGVtYSBpbiBaU2NoZW1hLiAgVG8gZml4IHRoaXMgc28gdGhhdCB0aGUgSlNPTiBTY2hlbWEgdmFsaWRhdG9yIHdvcmtzIHByb3Blcmx5LCB3ZVxuICAgIC8vIG5lZWQgdG8gc2V0IHRoZSBpZCB0byBiZSB0aGUgbmFtZSBvZiB0aGUgc2NoZW1hIGZpbGUuXG4gICAgdmFyIGZpeGVkID0gXy5jbG9uZURlZXAodGhhdC5zY2hlbWFzW3NjaGVtYU5hbWVdKTtcblxuICAgIGZpeGVkLmlkID0gc2NoZW1hTmFtZTtcblxuICAgIHJldHVybiBmaXhlZDtcbiAgfTtcbiAgdmFyIHByaW1pdGl2ZXMgPSBbJ3N0cmluZycsICdudW1iZXInLCAnYm9vbGVhbicsICdpbnRlZ2VyJywgJ2FycmF5J107XG5cbiAgc3dpdGNoICh2ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgdGhpcy5kb2NzVXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9zd2FnZ2VyLWFwaS9zd2FnZ2VyLXNwZWMvYmxvYi9tYXN0ZXIvdmVyc2lvbnMvMS4yLm1kJztcbiAgICB0aGlzLnByaW1pdGl2ZXMgPSBfLnVuaW9uKHByaW1pdGl2ZXMsIFsndm9pZCcsICdGaWxlJ10pO1xuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjEuMic7XG5cbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzID0ge1xuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9hcGlEZWNsYXJhdGlvbi5qc29uJyksXG4gICAgICAnYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvYXV0aG9yaXphdGlvbk9iamVjdC5qc29uJyksXG4gICAgICAnZGF0YVR5cGUuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlLmpzb24nKSxcbiAgICAgICdkYXRhVHlwZUJhc2UuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL2RhdGFUeXBlQmFzZS5qc29uJyksXG4gICAgICAnaW5mb09iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvaW5mb09iamVjdC5qc29uJyksXG4gICAgICAnbW9kZWxzT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9tb2RlbHNPYmplY3QuanNvbicpLFxuICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24nKSxcbiAgICAgICdvcGVyYXRpb25PYmplY3QuanNvbic6IHJlcXVpcmUoJy4uL3NjaGVtYXMvMS4yL29wZXJhdGlvbk9iamVjdC5qc29uJyksXG4gICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nOiByZXF1aXJlKCcuLi9zY2hlbWFzLzEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbicpLFxuICAgICAgJ3Jlc291cmNlTGlzdGluZy5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24nKSxcbiAgICAgICdyZXNvdXJjZU9iamVjdC5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8xLjIvcmVzb3VyY2VPYmplY3QuanNvbicpXG4gICAgfTtcblxuICAgIHRoaXMudmFsaWRhdG9ycyA9IGNyZWF0ZVZhbGlkYXRvcnModGhpcywge1xuICAgICAgJ2FwaURlY2xhcmF0aW9uLmpzb24nOiBfLm1hcChbXG4gICAgICAgICdkYXRhVHlwZUJhc2UuanNvbicsXG4gICAgICAgICdtb2RlbHNPYmplY3QuanNvbicsXG4gICAgICAgICdvYXV0aDJHcmFudFR5cGUuanNvbicsXG4gICAgICAgICdhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAncGFyYW1ldGVyT2JqZWN0Lmpzb24nLFxuICAgICAgICAnb3BlcmF0aW9uT2JqZWN0Lmpzb24nLFxuICAgICAgICAnYXBpRGVjbGFyYXRpb24uanNvbidcbiAgICAgIF0sIGZpeFNjaGVtYUlkKSxcbiAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbic6IF8ubWFwKFtcbiAgICAgICAgJ3Jlc291cmNlT2JqZWN0Lmpzb24nLFxuICAgICAgICAnaW5mb09iamVjdC5qc29uJyxcbiAgICAgICAgJ29hdXRoMkdyYW50VHlwZS5qc29uJyxcbiAgICAgICAgJ2F1dGhvcml6YXRpb25PYmplY3QuanNvbicsXG4gICAgICAgICdyZXNvdXJjZUxpc3RpbmcuanNvbidcbiAgICAgIF0sIGZpeFNjaGVtYUlkKVxuICAgIH0pO1xuXG4gICAgYnJlYWs7XG5cbiAgY2FzZSAnMi4wJzpcbiAgICB0aGlzLmRvY3NVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9ibG9iL21hc3Rlci92ZXJzaW9ucy8yLjAubWQnO1xuICAgIHRoaXMucHJpbWl0aXZlcyA9IF8udW5pb24ocHJpbWl0aXZlcywgWydmaWxlJ10pO1xuICAgIHRoaXMuc2NoZW1hc1VybCA9ICdodHRwczovL2dpdGh1Yi5jb20vc3dhZ2dlci1hcGkvc3dhZ2dlci1zcGVjL3RyZWUvbWFzdGVyL3NjaGVtYXMvdjIuMCc7XG5cbiAgICAvLyBIZXJlIGV4cGxpY2l0bHkgdG8gYWxsb3cgYnJvd3NlcmlmeSB0byB3b3JrXG4gICAgdGhpcy5zY2hlbWFzID0ge1xuICAgICAgJ3NjaGVtYS5qc29uJzogcmVxdWlyZSgnLi4vc2NoZW1hcy8yLjAvc2NoZW1hLmpzb24nKVxuICAgIH07XG5cbiAgICB0aGlzLnZhbGlkYXRvcnMgPSBjcmVhdGVWYWxpZGF0b3JzKHRoaXMsIHtcbiAgICAgICdzY2hlbWEuanNvbic6IFtmaXhTY2hlbWFJZCgnc2NoZW1hLmpzb24nKV1cbiAgICB9KTtcblxuICAgIGJyZWFrO1xuXG4gIGRlZmF1bHQ6XG4gICAgdGhyb3cgbmV3IEVycm9yKHZlcnNpb24gKyAnIGlzIGFuIHVuc3VwcG9ydGVkIFN3YWdnZXIgc3BlY2lmaWNhdGlvbiB2ZXJzaW9uJyk7XG4gIH1cblxuICB0aGlzLnZlcnNpb24gPSB2ZXJzaW9uO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSByZXN1bHQgb2YgdGhlIHZhbGlkYXRpb24gb2YgdGhlIFN3YWdnZXIgZG9jdW1lbnQocykuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IHJsT3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIExpc3RpbmcgKDEuMikgb3IgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7b2JqZWN0W119IFthcGlEZWNsYXJhdGlvbnNdIC0gVGhlIGFycmF5IG9mIFN3YWdnZXIgQVBJIERlY2xhcmF0aW9ucyAoMS4yKVxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdW5kZWZpbmVkIGlmIHZhbGlkYXRpb24gcGFzc2VzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIGVycm9ycyBhbmQvb3Igd2FybmluZ3NcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBwcm92aWRlZCBhcmUgbm90IHZhbGlkXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlID0gZnVuY3Rpb24gKHJsT3JTTywgYXBpRGVjbGFyYXRpb25zLCBjYWxsYmFjaykge1xuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3Jlc291cmNlTGlzdGluZyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChybE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXNvdXJjZUxpc3RpbmcgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBpcyByZXF1aXJlZCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNBcnJheShhcGlEZWNsYXJhdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbnMgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQocmxPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KHJsT3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N3YWdnZXJPYmplY3QgbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmICh0aGlzLnZlcnNpb24gPT09ICcyLjAnKSB7XG4gICAgY2FsbGJhY2sgPSBhcmd1bWVudHNbMV07XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIC8vIEZvciBTd2FnZ2VyIDIuMCwgbWFrZSBzdXJlIGFwaURlY2xhcmF0aW9ucyBpcyBhbiBlbXB0eSBhcnJheVxuICBpZiAodGhpcy52ZXJzaW9uID09PSAnMi4wJykge1xuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xuICB9XG5cbiAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gIC8vIFBlcmZvcm0gdGhlIHZhbGlkYXRpb25cbiAgdmFsaWRhdGVTdHJ1Y3R1cmFsbHkodGhpcywgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmIChlcnIgfHwgaGVscGVycy5mb3JtYXRSZXN1bHRzKHJlc3VsdCkpIHtcbiAgICAgIGNhbGxiYWNrKGVyciwgcmVzdWx0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsaWRhdGVTZW1hbnRpY2FsbHkodGhhdCwgcmxPclNPLCBhcGlEZWNsYXJhdGlvbnMsIGNhbGxiYWNrKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgSlNPTiBTY2hlbWEgcmVwcmVzZW50YXRpb24gb2YgYSBjb21wb3NlZCBtb2RlbCBiYXNlZCBvbiBpdHMgaWQgb3IgcmVmZXJlbmNlLlxuICpcbiAqIE5vdGU6IEZvciBTd2FnZ2VyIDEuMiwgd2Ugb25seSBwZXJmb3JtIHN0cnVjdHVyYWwgdmFsaWRhdGlvbiBwcmlvciB0byBjb21wb3NpbmcgdGhlIG1vZGVsLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBhcGlET3JTTyAtIFRoZSBTd2FnZ2VyIFJlc291cmNlIEFQSSBEZWNsYXJhdGlvbiAoMS4yKSBvciB0aGUgU3dhZ2dlciBPYmplY3QgKDIuMClcbiAqIEBwYXJhbSB7c3RyaW5nfSBtb2RlbElkT3JSZWYgLSBUaGUgbW9kZWwgaWQgKDEuMikgb3IgdGhlIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgKDEuMiBvciAyLjApXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB0aGUgb2JqZWN0IHJlcHJlc2VudGluZyBhIGNvbXBvc2VkIG9iamVjdFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLmNvbXBvc2VNb2RlbCA9IGZ1bmN0aW9uIChhcGlET3JTTywgbW9kZWxJZE9yUmVmLCBjYWxsYmFjaykge1xuICB2YXIgc3dhZ2dlclZlcnNpb24gPSBoZWxwZXJzLmdldFN3YWdnZXJWZXJzaW9uKGFwaURPclNPKTtcbiAgdmFyIGRvQ29tcG9zaXRpb24gPSBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XG5cbiAgICBpZiAoZXJyKSB7XG4gICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICB9IGVsc2UgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGRvY3VtZW50TWV0YWRhdGEgPSBnZXREb2N1bWVudENhY2hlKGFwaURPclNPKTtcbiAgICByZXN1bHRzID0ge1xuICAgICAgZXJyb3JzOiBbXSxcbiAgICAgIHdhcm5pbmdzOiBbXVxuICAgIH07XG5cbiAgICBwcm9jZXNzRG9jdW1lbnQoZG9jdW1lbnRNZXRhZGF0YSwgcmVzdWx0cyk7XG5cbiAgICBpZiAoIWRvY3VtZW50TWV0YWRhdGEuZGVmaW5pdGlvbnNbbW9kZWxJZE9yUmVmXSkge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKCk7XG4gICAgfVxuXG4gICAgaWYgKGhlbHBlcnMuZ2V0RXJyb3JDb3VudChyZXN1bHRzKSA+IDApIHtcbiAgICAgIHJldHVybiBoYW5kbGVWYWxpZGF0aW9uRXJyb3IocmVzdWx0cywgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgZ2V0T3JDb21wb3NlU2NoZW1hKGRvY3VtZW50TWV0YWRhdGEsIG1vZGVsSWRPclJlZikpO1xuICB9O1xuXG4gIHN3aXRjaCAodGhpcy52ZXJzaW9uKSB7XG4gIGNhc2UgJzEuMic6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2FwaURlY2xhcmF0aW9uIGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignYXBpRGVjbGFyYXRpb24gbXVzdCBiZSBhbiBvYmplY3QnKTtcbiAgICB9XG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChtb2RlbElkT3JSZWYpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21vZGVsSWQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcblxuICBjYXNlICcyLjAnOlxuICAgIC8vIFZhbGlkYXRlIGFyZ3VtZW50c1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdzd2FnZ2VyT2JqZWN0IGlzIHJlcXVpcmVkJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGFwaURPclNPKSkge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignc3dhZ2dlck9iamVjdCBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxSZWYgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgaWYgKG1vZGVsSWRPclJlZi5jaGFyQXQoMCkgIT09ICcjJykge1xuICAgIGlmICh0aGlzLnZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgICBtb2RlbElkT3JSZWYgPSAnIy9tb2RlbHMvJyArIG1vZGVsSWRPclJlZjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBtdXN0IGJlIGEgSlNPTiBQb2ludGVyJyk7XG4gICAgfVxuICB9XG5cbiAgLy8gRW5zdXJlIHRoZSBkb2N1bWVudCBpcyB2YWxpZCBmaXJzdFxuICBpZiAoc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdmFsaWRhdGVBZ2FpbnN0U2NoZW1hKHRoaXMsICdhcGlEZWNsYXJhdGlvbi5qc29uJywgYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xuICB9IGVsc2Uge1xuICAgIHRoaXMudmFsaWRhdGUoYXBpRE9yU08sIGRvQ29tcG9zaXRpb24pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyBhIG1vZGVsIGJhc2VkIG9uIGl0cyBpZC5cbiAqXG4gKiBOb3RlOiBGb3IgU3dhZ2dlciAxLjIsIHdlIG9ubHkgcGVyZm9ybSBzdHJ1Y3R1cmFsIHZhbGlkYXRpb24gcHJpb3IgdG8gY29tcG9zaW5nIHRoZSBtb2RlbC5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gYXBpRE9yU08gLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBBUEkgRGVjbGFyYXRpb24gKDEuMikgb3IgdGhlIFN3YWdnZXIgT2JqZWN0ICgyLjApXG4gKiBAcGFyYW0ge3N0cmluZ30gbW9kZWxJZE9yUmVmIC0gVGhlIG1vZGVsIGlkICgxLjIpIG9yIHRoZSByZWZlcmVuY2UgdG8gdGhlIG1vZGVsICgxLjIgb3IgMi4wKVxuICogQHBhcmFtIHsqfSBkYXRhIC0gVGhlIG1vZGVsIHRvIHZhbGlkYXRlXG4gKiBAcGFyYW0ge3Jlc3VsdENhbGxiYWNrfSBjYWxsYmFjayAtIFRoZSByZXN1bHQgY2FsbGJhY2tcbiAqXG4gKiBAcmV0dXJucyB1bmRlZmluZWQgaWYgdmFsaWRhdGlvbiBwYXNzZXMgb3IgYW4gb2JqZWN0IGNvbnRhaW5pbmcgZXJyb3JzIGFuZC9vciB3YXJuaW5nc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlcmUgYXJlIHZhbGlkYXRpb24gZXJyb3JzIHdoaWxlIGNyZWF0aW5nXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnZhbGlkYXRlTW9kZWwgPSBmdW5jdGlvbiAoYXBpRE9yU08sIG1vZGVsSWRPclJlZiwgZGF0YSwgY2FsbGJhY2spIHtcbiAgc3dpdGNoICh0aGlzLnZlcnNpb24pIHtcbiAgY2FzZSAnMS4yJzpcbiAgICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgICBpZiAoXy5pc1VuZGVmaW5lZChhcGlET3JTTykpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignYXBpRGVjbGFyYXRpb24gaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdhcGlEZWNsYXJhdGlvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH1cblxuICAgIGlmIChfLmlzVW5kZWZpbmVkKG1vZGVsSWRPclJlZikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbW9kZWxJZCBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuXG4gIGNhc2UgJzIuMCc6XG4gICAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gICAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3N3YWdnZXJPYmplY3QgaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoYXBpRE9yU08pKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdzd2FnZ2VyT2JqZWN0IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfVxuXG4gICAgaWYgKF8uaXNVbmRlZmluZWQobW9kZWxJZE9yUmVmKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtb2RlbFJlZiBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGJyZWFrO1xuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZGF0YSkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2RhdGEgaXMgcmVxdWlyZWQnKTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgdmFyIHRoYXQgPSB0aGlzO1xuXG4gIHRoaXMuY29tcG9zZU1vZGVsKGFwaURPclNPLCBtb2RlbElkT3JSZWYsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgIH1cblxuICAgIHZhbGlkYXRlQWdhaW5zdFNjaGVtYSh0aGF0LCByZXN1bHQsIGRhdGEsIGNhbGxiYWNrKTtcbiAgfSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBmdWxseSByZXNvbHZlZCBkb2N1bWVudCBvciBkb2N1bWVudCBmcmFnbWVudC4gIChEb2VzIG5vdCBwZXJmb3JtIHZhbGlkYXRpb24gYXMgdGhpcyBpcyB0eXBpY2FsbHkgY2FsbGVkXG4gKiBhZnRlciB2YWxpZGF0aW9uIG9jY3Vycy4pKVxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBkb2N1bWVudCAtIFRoZSBkb2N1bWVudCB0byByZXNvbHZlIG9yIHRoZSBkb2N1bWVudCBjb250YWluaW5nIHRoZSByZWZlcmVuY2UgdG8gcmVzb2x2ZVxuICogQHBhcmFtIHtzdHJpbmd9IFtwdHJdIC0gVGhlIEpTT04gUG9pbnRlciBvciB1bmRlZmluZWQgdG8gcmV0dXJuIHRoZSB3aG9sZSBkb2N1bWVudFxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIGZ1bGx5IHJlc29sdmVkIGRvY3VtZW50IG9yIGZyYWdtZW50XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBhcmUgdXBzdHJlYW0gZXJyb3JzXG4gKi9cblNwZWNpZmljYXRpb24ucHJvdG90eXBlLnJlc29sdmUgPSBmdW5jdGlvbiAoZG9jdW1lbnQsIHB0ciwgY2FsbGJhY2spIHtcbiAgdmFyIGRvY3VtZW50TWV0YWRhdGE7XG4gIHZhciByZXNwb25kID0gZnVuY3Rpb24gKGRvY3VtZW50KSB7XG4gICAgaWYgKF8uaXNTdHJpbmcocHRyKSkge1xuICAgICAgcmV0dXJuIGNhbGxiYWNrKHVuZGVmaW5lZCwgdHJhdmVyc2UoZG9jdW1lbnQpLmdldChKc29uUmVmcy5wYXRoRnJvbVB0cihwdHIpKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjYWxsYmFjayh1bmRlZmluZWQsIGRvY3VtZW50KTtcbiAgICB9XG4gIH07XG5cbiAgLy8gVmFsaWRhdGUgYXJndW1lbnRzXG4gIGlmIChfLmlzVW5kZWZpbmVkKGRvY3VtZW50KSkge1xuICAgIHRocm93IG5ldyBFcnJvcignZG9jdW1lbnQgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGRvY3VtZW50KSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2RvY3VtZW50IG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMikge1xuICAgIGNhbGxiYWNrID0gYXJndW1lbnRzWzFdO1xuICAgIHB0ciA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICghXy5pc1VuZGVmaW5lZChwdHIpICYmICFfLmlzU3RyaW5nKHB0cikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwdHIgbXVzdCBiZSBhIEpTT04gUG9pbnRlciBzdHJpbmcnKTtcbiAgfVxuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignY2FsbGJhY2sgaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2NhbGxiYWNrIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICB9XG5cbiAgZG9jdW1lbnRNZXRhZGF0YSA9IGdldERvY3VtZW50Q2FjaGUoZG9jdW1lbnQpO1xuXG4gIC8vIFN3YWdnZXIgMS4yIGlzIG5vdCBzdXBwb3J0ZWQgZHVlIHRvIGludmFsaWQgSlNPTiBSZWZlcmVuY2VzIGJlaW5nIHVzZWQuICBFdmVuIGlmIHRoZSBKU09OIFJlZmVyZW5jZXMgd2VyZSB2YWxpZCxcbiAgLy8gdGhlIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDEuMiBkbyBub3QgYWxsb3cgSmF2YVNjcmlwdCBvYmplY3RzIGluIGFsbCBwbGFjZXMgd2hlcmUgdGhlIHJlc291dGlvbiB3b3VsZCBvY2N1ci5cbiAgaWYgKGRvY3VtZW50TWV0YWRhdGEuc3dhZ2dlclZlcnNpb24gPT09ICcxLjInKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdTd2FnZ2VyIDEuMiBpcyBub3Qgc3VwcG9ydGVkJyk7XG4gIH1cblxuICBpZiAoIWRvY3VtZW50TWV0YWRhdGEucmVzb2x2ZWQpIHtcbiAgICAvLyBFbnN1cmUgdGhlIGRvY3VtZW50IGlzIHZhbGlkIGZpcnN0XG4gICAgdGhpcy52YWxpZGF0ZShkb2N1bWVudCwgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3BvbmQoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHJlc3BvbmQoZG9jdW1lbnRNZXRhZGF0YS5yZXNvbHZlZCk7XG4gIH1cbn07XG5cbi8qKlxuICogQ29udmVydHMgdGhlIFN3YWdnZXIgMS4yIGRvY3VtZW50cyB0byBhIFN3YWdnZXIgMi4wIGRvY3VtZW50LlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSByZXNvdXJjZUxpc3RpbmcgLSBUaGUgU3dhZ2dlciBSZXNvdXJjZSBMaXN0aW5nXG4gKiBAcGFyYW0ge29iamVjdFtdfSBbYXBpRGVjbGFyYXRpb25zXSAtIFRoZSBhcnJheSBvZiBTd2FnZ2VyIEFQSSBEZWNsYXJhdGlvbnNcbiAqIEBwYXJhbSB7Ym9vbGVhbj1mYWxzZX0gW3NraXBWYWxpZGF0aW9uXSAtIFdoZXRoZXIgb3Igbm90IHRvIHNraXAgdmFsaWRhdGlvblxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gY2FsbGJhY2sgLSBUaGUgcmVzdWx0IGNhbGxiYWNrXG4gKlxuICogQHJldHVybnMgdGhlIGNvbnZlcnRlZCBTd2FnZ2VyIGRvY3VtZW50XG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgYXJndW1lbnRzIHByb3ZpZGVkIGFyZSBub3QgdmFsaWRcbiAqL1xuU3BlY2lmaWNhdGlvbi5wcm90b3R5cGUuY29udmVydCA9IGZ1bmN0aW9uIChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgc2tpcFZhbGlkYXRpb24sIGNhbGxiYWNrKSB7XG4gIHZhciBkb0NvbnZlcnQgPSBmdW5jdGlvbiAocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpIHtcbiAgICBjYWxsYmFjayh1bmRlZmluZWQsIHN3YWdnZXJDb252ZXJ0ZXIocmVzb3VyY2VMaXN0aW5nLCBhcGlEZWNsYXJhdGlvbnMpKTtcbiAgfTtcblxuICBpZiAodGhpcy52ZXJzaW9uICE9PSAnMS4yJykge1xuICAgIHRocm93IG5ldyBFcnJvcignU3BlY2lmaWNhdGlvbiNjb252ZXJ0IG9ubHkgd29ya3MgZm9yIFN3YWdnZXIgMS4yJyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBhcmd1bWVudHNcbiAgaWYgKF8uaXNVbmRlZmluZWQocmVzb3VyY2VMaXN0aW5nKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncmVzb3VyY2VMaXN0aW5nIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChyZXNvdXJjZUxpc3RpbmcpKSB7XG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcigncmVzb3VyY2VMaXN0aW5nIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICAvLyBBUEkgRGVjbGFyYXRpb25zIGFyZSBvcHRpb25hbCBiZWNhdXNlIHN3YWdnZXItY29udmVydGVyIHdhcyB3cml0dGVuIHRvIHN1cHBvcnQgaXRcbiAgaWYgKF8uaXNVbmRlZmluZWQoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgIGFwaURlY2xhcmF0aW9ucyA9IFtdO1xuICB9XG5cbiAgaWYgKCFfLmlzQXJyYXkoYXBpRGVjbGFyYXRpb25zKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2FwaURlY2xhcmF0aW9ucyBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gIH1cblxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDQpIHtcbiAgICBjYWxsYmFjayA9IGFyZ3VtZW50c1thcmd1bWVudHMubGVuZ3RoIC0gMV07XG4gIH1cblxuICBpZiAoXy5pc1VuZGVmaW5lZChjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdjYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgfVxuXG4gIGlmIChza2lwVmFsaWRhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIGRvQ29udmVydChyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy52YWxpZGF0ZShyZXNvdXJjZUxpc3RpbmcsIGFwaURlY2xhcmF0aW9ucywgZnVuY3Rpb24gKGVyciwgcmVzdWx0cykge1xuICAgICAgaWYgKGVycikge1xuICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscGVycy5nZXRFcnJvckNvdW50KHJlc3VsdHMpID4gMCkge1xuICAgICAgICByZXR1cm4gaGFuZGxlVmFsaWRhdGlvbkVycm9yKHJlc3VsdHMsIGNhbGxiYWNrKTtcbiAgICAgIH1cblxuICAgICAgZG9Db252ZXJ0KHJlc291cmNlTGlzdGluZywgYXBpRGVjbGFyYXRpb25zKTtcbiAgICB9KTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMudjEgPSBtb2R1bGUuZXhwb3J0cy52MV8yID0gbmV3IFNwZWNpZmljYXRpb24oJzEuMicpOyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbm1vZHVsZS5leHBvcnRzLnYyID0gbW9kdWxlLmV4cG9ydHMudjJfMCA9IG5ldyBTcGVjaWZpY2F0aW9uKCcyLjAnKTsgLy8ganNoaW50IGlnbm9yZTpsaW5lXG4iLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEFwaWdlZSBDb3Jwb3JhdGlvblxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgXyA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydfJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydfJ10gOiBudWxsKTtcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbi8vIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzMzMzkjc2VjdGlvbi01LjZcbnZhciBkYXRlUmVnRXhwID0gL14oWzAtOV17NH0pLShbMC05XXsyfSktKFswLTldezJ9KSQvO1xuLy8gaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzMzOSNzZWN0aW9uLTUuNlxudmFyIGRhdGVUaW1lUmVnRXhwID0gL14oWzAtOV17Mn0pOihbMC05XXsyfSk6KFswLTldezJ9KSguWzAtOV0rKT8oenwoWystXVswLTldezJ9KTooWzAtOV17Mn0pKSQvO1xudmFyIGlzVmFsaWREYXRlID0gbW9kdWxlLmV4cG9ydHMuaXNWYWxpZERhdGUgPSBmdW5jdGlvbiAoZGF0ZSkge1xuICB2YXIgZGF5O1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1vbnRoO1xuXG4gIGlmIChfLmlzRGF0ZShkYXRlKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgaWYgKCFfLmlzU3RyaW5nKGRhdGUpKSB7XG4gICAgZGF0ZSA9IGRhdGUudG9TdHJpbmcoKTtcbiAgfVxuXG4gIG1hdGNoZXMgPSBkYXRlUmVnRXhwLmV4ZWMoZGF0ZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBkYXkgPSBtYXRjaGVzWzNdO1xuICBtb250aCA9IG1hdGNoZXNbMl07XG5cbiAgaWYgKG1vbnRoIDwgJzAxJyB8fCBtb250aCA+ICcxMicgfHwgZGF5IDwgJzAxJyB8fCBkYXkgPiAnMzEnKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xudmFyIGlzVmFsaWREYXRlVGltZSA9IG1vZHVsZS5leHBvcnRzLmlzVmFsaWREYXRlVGltZSA9IGZ1bmN0aW9uIChkYXRlVGltZSkge1xuICB2YXIgaG91cjtcbiAgdmFyIGRhdGU7XG4gIHZhciB0aW1lO1xuICB2YXIgbWF0Y2hlcztcbiAgdmFyIG1pbnV0ZTtcbiAgdmFyIHBhcnRzO1xuICB2YXIgc2Vjb25kO1xuICB2YXIgdGltZXpvbmVIb3VycztcbiAgdmFyIHRpbWV6b25lTWludXRlcztcblxuICBpZiAoXy5pc0RhdGUoZGF0ZVRpbWUpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZiAoIV8uaXNTdHJpbmcoZGF0ZVRpbWUpKSB7XG4gICAgZGF0ZVRpbWUgPSBkYXRlVGltZS50b1N0cmluZygpO1xuICB9XG5cbiAgcGFydHMgPSBkYXRlVGltZS50b0xvd2VyQ2FzZSgpLnNwbGl0KCd0Jyk7XG4gIGRhdGUgPSBwYXJ0c1swXTtcbiAgdGltZSA9IHBhcnRzLmxlbmd0aCA+IDEgPyBwYXJ0c1sxXSA6IHVuZGVmaW5lZDtcblxuICBpZiAoIWlzVmFsaWREYXRlKGRhdGUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgbWF0Y2hlcyA9IGRhdGVUaW1lUmVnRXhwLmV4ZWModGltZSk7XG5cbiAgaWYgKG1hdGNoZXMgPT09IG51bGwpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBob3VyID0gbWF0Y2hlc1sxXTtcbiAgbWludXRlID0gbWF0Y2hlc1syXTtcbiAgc2Vjb25kID0gbWF0Y2hlc1szXTtcbiAgaWYgKG1hdGNoZXNbNV0gPT09ICd6Jykge1xuICAgIHRpbWV6b25lSG91cnMgPSAwO1xuICAgIHRpbWV6b25lTWludXRlcyA9IDA7XG4gIH0gZWxzZSB7XG4gICAgdGltZXpvbmVIb3VycyA9IE51bWJlcihtYXRjaGVzWzZdKTtcbiAgICB0aW1lem9uZU1pbnV0ZXMgPSBOdW1iZXIobWF0Y2hlc1s3XSk7XG4gIH1cblxuICB2YXIgdmFsaWRUaW1lem9uZU1pbnV0ZXMgPSB0aW1lem9uZU1pbnV0ZXMgPT09IDAgfHwgdGltZXpvbmVNaW51dGVzID09PSAxNSB8fCB0aW1lem9uZU1pbnV0ZXMgPT09IDMwIHx8IHRpbWV6b25lTWludXRlcyA9PT0gNDU7XG5cbiAgaWYgKGhvdXIgPiAnMjMnIHx8IG1pbnV0ZSA+ICc1OScgfHwgc2Vjb25kID4gJzU5JyB8fCB0aW1lem9uZUhvdXJzID4gMTQgfHwgdGltZXpvbmVIb3VycyA8IC0xMiB8fCAhdmFsaWRUaW1lem9uZU1pbnV0ZXMpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbnZhciB0aHJvd0Vycm9yV2l0aENvZGUgPSBmdW5jdGlvbiAoY29kZSwgbXNnKSB7XG4gIHZhciBlcnIgPSBuZXcgRXJyb3IobXNnKTtcblxuICBlcnIuY29kZSA9IGNvZGU7XG4gIGVyci5mYWlsZWRWYWxpZGF0aW9uID0gdHJ1ZTtcblxuICB0aHJvdyBlcnI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUFnYWluc3RTY2hlbWEgPSBmdW5jdGlvbiAoc2NoZW1hT3JOYW1lLCBkYXRhLCB2YWxpZGF0b3IpIHtcbiAgdmFyIHNhbml0aXplRXJyb3IgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgLy8gTWFrZSBhbnlPZi9vbmVPZiBlcnJvcnMgbW9yZSBodW1hbiByZWFkYWJsZSAoSXNzdWUgMjAwKVxuICAgIHZhciBkZWZUeXBlID0gWydhZGRpdGlvbmFsUHJvcGVydGllcycsICdpdGVtcyddLmluZGV4T2Yob2JqLnBhdGhbb2JqLnBhdGgubGVuZ3RoIC0gMV0pID4gLTEgP1xuICAgICAgICAgICdzY2hlbWEnIDpcbiAgICAgICAgICBvYmoucGF0aFtvYmoucGF0aC5sZW5ndGggLSAyXTtcblxuICAgIGlmIChbJ0FOWV9PRl9NSVNTSU5HJywgJ09ORV9PRl9NSVNTSU5HJ10uaW5kZXhPZihvYmouY29kZSkgPiAtMSkge1xuICAgICAgc3dpdGNoIChkZWZUeXBlKSB7XG4gICAgICBjYXNlICdwYXJhbWV0ZXJzJzpcbiAgICAgICAgZGVmVHlwZSA9ICdwYXJhbWV0ZXInO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAncmVzcG9uc2VzJzpcbiAgICAgICAgZGVmVHlwZSA9ICdyZXNwb25zZSc7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdzY2hlbWEnOlxuICAgICAgICBkZWZUeXBlICs9ICcgJyArIG9iai5wYXRoW29iai5wYXRoLmxlbmd0aCAtIDFdO1xuXG4gICAgICAgIC8vIG5vIGRlZmF1bHRcbiAgICAgIH1cblxuICAgICAgb2JqLm1lc3NhZ2UgPSAnTm90IGEgdmFsaWQgJyArIGRlZlR5cGUgKyAnIGRlZmluaXRpb24nO1xuICAgIH1cblxuICAgIC8vIFJlbW92ZSB0aGUgcGFyYW1zIHBvcnRpb24gb2YgdGhlIGVycm9yXG4gICAgZGVsZXRlIG9iai5wYXJhbXM7XG4gICAgZGVsZXRlIG9iai5zY2hlbWFJZDtcblxuICAgIGlmIChvYmouaW5uZXIpIHtcbiAgICAgIF8uZWFjaChvYmouaW5uZXIsIGZ1bmN0aW9uIChuT2JqKSB7XG4gICAgICAgIHNhbml0aXplRXJyb3Iobk9iaik7XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG4gIHZhciBzY2hlbWEgPSBfLmlzUGxhaW5PYmplY3Qoc2NoZW1hT3JOYW1lKSA/IF8uY2xvbmVEZWVwKHNjaGVtYU9yTmFtZSkgOiBzY2hlbWFPck5hbWU7XG5cbiAgLy8gV2UgZG9uJ3QgY2hlY2sgdGhpcyBkdWUgdG8gaW50ZXJuYWwgdXNhZ2UgYnV0IGlmIHZhbGlkYXRvciBpcyBub3QgcHJvdmlkZWQsIHNjaGVtYU9yTmFtZSBtdXN0IGJlIGEgc2NoZW1hXG4gIGlmIChfLmlzVW5kZWZpbmVkKHZhbGlkYXRvcikpIHtcbiAgICB2YWxpZGF0b3IgPSBoZWxwZXJzLmNyZWF0ZUpzb25WYWxpZGF0b3IoW3NjaGVtYV0pO1xuICB9XG5cbiAgdmFyIHZhbGlkID0gdmFsaWRhdG9yLnZhbGlkYXRlKGRhdGEsIHNjaGVtYSk7XG5cbiAgaWYgKCF2YWxpZCkge1xuICAgIHRyeSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1NDSEVNQV9WQUxJREFUSU9OX0ZBSUxFRCcsICdGYWlsZWQgc2NoZW1hIHZhbGlkYXRpb24nKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgIGVyci5yZXN1bHRzID0ge1xuICAgICAgICBlcnJvcnM6IF8ubWFwKHZhbGlkYXRvci5nZXRMYXN0RXJyb3JzKCksIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgICAgICBzYW5pdGl6ZUVycm9yKGVycik7XG5cbiAgICAgICAgICByZXR1cm4gZXJyO1xuICAgICAgICB9KSxcbiAgICAgICAgd2FybmluZ3M6IFtdXG4gICAgICB9O1xuXG4gICAgICB0aHJvdyBlcnI7XG4gICAgfVxuICB9XG59O1xuXG5cbi8qKlxuICogVmFsaWRhdGVzIGEgc2NoZW1hIG9mIHR5cGUgYXJyYXkgaXMgcHJvcGVybHkgZm9ybWVkICh3aGVuIG5lY2Vzc2FyKS5cbiAqXG4gKiAqcGFyYW0ge29iamVjdH0gc2NoZW1hIC0gVGhlIHNjaGVtYSBvYmplY3QgdG8gdmFsaWRhdGVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBzY2hlbWEgc2F5cyBpdCdzIGFuIGFycmF5IGJ1dCBpdCBpcyBub3QgZm9ybWVkIHByb3Blcmx5XG4gKlxuICogQHNlZSB7QGxpbmsgaHR0cHM6Ly9naXRodWIuY29tL3N3YWdnZXItYXBpL3N3YWdnZXItc3BlYy9pc3N1ZXMvMTc0fVxuICovXG52YXIgdmFsaWRhdGVBcnJheVR5cGUgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUFycmF5VHlwZSA9IGZ1bmN0aW9uIChzY2hlbWEpIHtcbiAgLy8gV2UgaGF2ZSB0byBkbyB0aGlzIG1hbnVhbGx5IGZvciBub3dcbiAgaWYgKHNjaGVtYS50eXBlID09PSAnYXJyYXknICYmIF8uaXNVbmRlZmluZWQoc2NoZW1hLml0ZW1zKSkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnT0JKRUNUX01JU1NJTkdfUkVRVUlSRURfUFJPUEVSVFknLCAnTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eTogaXRlbXMnKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHJlcXVlc3Qgb3IgcmVzcG9uc2UgY29udGVudCB0eXBlICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmdbXX0gZ1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIEFQSSBzY29wZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gb1BPckMgLSBUaGUgdmFsaWQgY29uc3VtZXMgYXQgdGhlIG9wZXJhdGlvbiBzY29wZVxuICogQHBhcmFtIHtvYmplY3R9IHJlcU9yUmVzIC0gVGhlIHJlcXVlc3Qgb3IgcmVzcG9uc2VcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBjb250ZW50IHR5cGUgaXMgaW52YWxpZFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZUNvbnRlbnRUeXBlID0gZnVuY3Rpb24gKGdQT3JDLCBvUE9yQywgcmVxT3JSZXMpIHtcbiAgLy8gaHR0cDovL3d3dy53My5vcmcvUHJvdG9jb2xzL3JmYzI2MTYvcmZjMjYxNi1zZWM3Lmh0bWwjc2VjNy4yLjFcbiAgdmFyIGlzUmVzcG9uc2UgPSB0eXBlb2YgcmVxT3JSZXMuZW5kID09PSAnZnVuY3Rpb24nO1xuICB2YXIgY29udGVudFR5cGUgPSBpc1Jlc3BvbnNlID8gcmVxT3JSZXMuZ2V0SGVhZGVyKCdjb250ZW50LXR5cGUnKSA6IHJlcU9yUmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddO1xuICB2YXIgcE9yQyA9IF8ubWFwKF8udW5pb24oZ1BPckMsIG9QT3JDKSwgZnVuY3Rpb24gKGNvbnRlbnRUeXBlKSB7XG4gICAgcmV0dXJuIGNvbnRlbnRUeXBlLnNwbGl0KCc7JylbMF07XG4gIH0pO1xuXG4gIGlmICghY29udGVudFR5cGUpIHtcbiAgICBpZiAoaXNSZXNwb25zZSkge1xuICAgICAgY29udGVudFR5cGUgPSAndGV4dC9wbGFpbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnRlbnRUeXBlID0gJ2FwcGxpY2F0aW9uL29jdGV0LXN0cmVhbSc7XG4gICAgfVxuICB9XG5cbiAgY29udGVudFR5cGUgPSBjb250ZW50VHlwZS5zcGxpdCgnOycpWzBdO1xuXG4gIGlmIChwT3JDLmxlbmd0aCA+IDAgJiYgKGlzUmVzcG9uc2UgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICB0cnVlIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgWydQT1NUJywgJ1BVVCddLmluZGV4T2YocmVxT3JSZXMubWV0aG9kKSAhPT0gLTEpICYmIHBPckMuaW5kZXhPZihjb250ZW50VHlwZSkgPT09IC0xKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbnRlbnQgdHlwZSAoJyArIGNvbnRlbnRUeXBlICsgJykuICBUaGVzZSBhcmUgdmFsaWQ6ICcgKyBwT3JDLmpvaW4oJywgJykpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYWdhaW5zdCB0aGUgYWxsb3dhYmxlIHZhbHVlcyAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmdbXX0gYWxsb3dlZCAtIFRoZSBhbGxvd2FibGUgdmFsdWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbm90IGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVFbnVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVFbnVtID0gZnVuY3Rpb24gKHZhbCwgYWxsb3dlZCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQoYWxsb3dlZCkgJiYgIV8uaXNVbmRlZmluZWQodmFsKSAmJiBhbGxvd2VkLmluZGV4T2YodmFsKSA9PT0gLTEpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0VOVU1fTUlTTUFUQ0gnLCAnTm90IGFuIGFsbG93YWJsZSB2YWx1ZSAoJyArIGFsbG93ZWQuam9pbignLCAnKSArICcpOiAnICsgdmFsKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGlzIGxlc3MgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7Kn0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtzdHJpbmd9IG1heGltdW0gLSBUaGUgbWF4aW11bSB2YWx1ZVxuICogQHBhcmFtIHtib29sZWFufSBbZXhjbHVzaXZlPWZhbHNlXSAtIFdoZXRoZXIgb3Igbm90IHRoZSB2YWx1ZSBpbmNsdWRlcyB0aGUgbWF4aW11bSBpbiBpdHMgY29tcGFyaXNvblxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bVxuICovXG52YXIgdmFsaWRhdGVNYXhpbXVtID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhpbXVtID0gZnVuY3Rpb24gKHZhbCwgbWF4aW11bSwgdHlwZSwgZXhjbHVzaXZlKSB7XG4gIHZhciBjb2RlID0gZXhjbHVzaXZlID09PSB0cnVlID8gJ01BWElNVU1fRVhDTFVTSVZFJyA6ICdNQVhJTVVNJztcbiAgdmFyIHRlc3RNYXg7XG4gIHZhciB0ZXN0VmFsO1xuXG4gIGlmIChfLmlzVW5kZWZpbmVkKGV4Y2x1c2l2ZSkpIHtcbiAgICBleGNsdXNpdmUgPSBmYWxzZTtcbiAgfVxuXG4gIGlmICh0eXBlID09PSAnaW50ZWdlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VJbnQodmFsLCAxMCk7XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICB0ZXN0VmFsID0gcGFyc2VGbG9hdCh2YWwpO1xuICB9XG5cbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heGltdW0pKSB7XG4gICAgdGVzdE1heCA9IHBhcnNlRmxvYXQobWF4aW11bSk7XG5cbiAgICBpZiAoZXhjbHVzaXZlICYmIHRlc3RWYWwgPj0gdGVzdE1heCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfSBlbHNlIGlmICh0ZXN0VmFsID4gdGVzdE1heCkge1xuICAgICAgdGhyb3dFcnJvcldpdGhDb2RlKGNvZGUsICdHcmVhdGVyIHRoYW4gdGhlIGNvbmZpZ3VyZWQgbWF4aW11bSAoJyArIG1heGltdW0gKyAnKTogJyArIHZhbCk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgYXJyYXkgY291bnQgaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhJdGVtcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBpdGVtc1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGNvbnRhaW5zIG1vcmUgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTWF4SXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1heEl0ZW1zID0gZnVuY3Rpb24gKHZhbCwgbWF4SXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heEl0ZW1zKSAmJiB2YWwubGVuZ3RoID4gbWF4SXRlbXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9MT05HJywgJ0FycmF5IGlzIHRvbyBsb25nICgnICsgdmFsLmxlbmd0aCArICcpLCBtYXhpbXVtICcgKyBtYXhJdGVtcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBsZW5ndGggaXMgbGVzcyB0aGFuIHRoZSBtYXhpbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqW119IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7bnVtYmVyfSBtYXhMZW5ndGggLSBUaGUgbWF4aW11bSBsZW5ndGhcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSdzIGxlbmd0aCBpcyBncmVhdGVyIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4TGVuZ3RoID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNYXhMZW5ndGggPSBmdW5jdGlvbiAodmFsLCBtYXhMZW5ndGgpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1heExlbmd0aCkgJiYgdmFsLmxlbmd0aCA+IG1heExlbmd0aCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTUFYX0xFTkdUSCcsICdTdHJpbmcgaXMgdG9vIGxvbmcgKCcgKyB2YWwubGVuZ3RoICsgJyBjaGFycyksIG1heGltdW0gJyArIG1heExlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGdyZWF0ZXIgdGhhbiB0aGUgbWF4aW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtYXhpbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1heGltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWF4UHJvcGVydGllcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWF4UHJvcGVydGllcyA9IGZ1bmN0aW9uICh2YWwsIG1heFByb3BlcnRpZXMpIHtcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtYXhQcm9wZXJ0aWVzKSAmJiBwcm9wQ291bnQgPiBtYXhQcm9wZXJ0aWVzKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNQVhfUFJPUEVSVElFUycsXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gbWFueSAoJyArIHByb3BDb3VudCArICcgcHJvcGVydGllcyksIG1heGltdW0gJyArIG1heFByb3BlcnRpZXMpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgYXJyYXkgY291bnQgaXMgZ3JlYXRlciB0aGFuIHRoZSBtaW5pbXVtICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gbWluaW11bSAtIFRoZSBtaW5pbXVtIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IFtleGNsdXNpdmU9ZmFsc2VdIC0gV2hldGhlciBvciBub3QgdGhlIHZhbHVlIGluY2x1ZGVzIHRoZSBtaW5pbXVtIGluIGl0cyBjb21wYXJpc29uXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgaXMgbGVzcyB0aGFuIHRoZSBtaW5pbXVtXG4gKi9cbnZhciB2YWxpZGF0ZU1pbmltdW0gPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbmltdW0gPSBmdW5jdGlvbiAodmFsLCBtaW5pbXVtLCB0eXBlLCBleGNsdXNpdmUpIHtcbiAgdmFyIGNvZGUgPSBleGNsdXNpdmUgPT09IHRydWUgPyAnTUlOSU1VTV9FWENMVVNJVkUnIDogJ01JTklNVU0nO1xuICB2YXIgdGVzdE1pbjtcbiAgdmFyIHRlc3RWYWw7XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQoZXhjbHVzaXZlKSkge1xuICAgIGV4Y2x1c2l2ZSA9IGZhbHNlO1xuICB9XG5cbiAgaWYgKHR5cGUgPT09ICdpbnRlZ2VyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUludCh2YWwsIDEwKTtcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuICAgIHRlc3RWYWwgPSBwYXJzZUZsb2F0KHZhbCk7XG4gIH1cblxuICBpZiAoIV8uaXNVbmRlZmluZWQobWluaW11bSkpIHtcbiAgICB0ZXN0TWluID0gcGFyc2VGbG9hdChtaW5pbXVtKTtcblxuICAgIGlmIChleGNsdXNpdmUgJiYgdGVzdFZhbCA8PSB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9IGVsc2UgaWYgKHRlc3RWYWwgPCB0ZXN0TWluKSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoY29kZSwgJ0xlc3MgdGhhbiB0aGUgY29uZmlndXJlZCBtaW5pbXVtICgnICsgbWluaW11bSArICcpOiAnICsgdmFsKTtcbiAgICB9XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93ZWQgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkl0ZW1zIC0gVGhlIG1pbmltdW0gbnVtYmVyIG9mIGl0ZW1zXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgY29udGFpbnMgZmV3ZXIgaXRlbXMgdGhhbiBhbGxvd2FibGVcbiAqL1xudmFyIHZhbGlkYXRlTWluSXRlbXMgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkl0ZW1zID0gZnVuY3Rpb24gKHZhbCwgbWluSXRlbXMpIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKG1pbkl0ZW1zKSAmJiB2YWwubGVuZ3RoIDwgbWluSXRlbXMpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0FSUkFZX0xFTkdUSF9TSE9SVCcsICdBcnJheSBpcyB0b28gc2hvcnQgKCcgKyB2YWwubGVuZ3RoICsgJyksIG1pbmltdW0gJyArIG1pbkl0ZW1zKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGxlbmd0aCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW0gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG1pbkxlbmd0aCAtIFRoZSBtaW5pbXVtIGxlbmd0aFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlJ3MgbGVuZ3RoIGlzIGxlc3MgdGhhbiB0aGUgbWluaW11bVxuICovXG52YXIgdmFsaWRhdGVNaW5MZW5ndGggPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZU1pbkxlbmd0aCA9IGZ1bmN0aW9uICh2YWwsIG1pbkxlbmd0aCkge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobWluTGVuZ3RoKSAmJiB2YWwubGVuZ3RoIDwgbWluTGVuZ3RoKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNSU5fTEVOR1RIJywgJ1N0cmluZyBpcyB0b28gc2hvcnQgKCcgKyB2YWwubGVuZ3RoICsgJyBjaGFycyksIG1pbmltdW0gJyArIG1pbkxlbmd0aCk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSdzIHByb3BlcnR5IGNvdW50IGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgbWluaW11bSAod2hlbiBuZWNlc3NhcnkpLlxuICpcbiAqIEBwYXJhbSB7KltdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge251bWJlcn0gbWluUHJvcGVydGllcyAtIFRoZSBtaW5pbXVtIG51bWJlciBvZiBwcm9wZXJ0aWVzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUncyBwcm9wZXJ0eSBjb3VudCBpcyBsZXNzIHRoYW4gdGhlIG1pbmltdW1cbiAqL1xudmFyIHZhbGlkYXRlTWluUHJvcGVydGllcyA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlTWluUHJvcGVydGllcyA9IGZ1bmN0aW9uICh2YWwsIG1pblByb3BlcnRpZXMpIHtcbiAgdmFyIHByb3BDb3VudCA9IF8uaXNQbGFpbk9iamVjdCh2YWwpID8gT2JqZWN0LmtleXModmFsKS5sZW5ndGggOiAwO1xuXG4gIGlmICghXy5pc1VuZGVmaW5lZChtaW5Qcm9wZXJ0aWVzKSAmJiBwcm9wQ291bnQgPCBtaW5Qcm9wZXJ0aWVzKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdNSU5fUFJPUEVSVElFUycsXG4gICAgICAgICAgICAgICAgICAgICAgICdOdW1iZXIgb2YgcHJvcGVydGllcyBpcyB0b28gZmV3ICgnICsgcHJvcENvdW50ICsgJyBwcm9wZXJ0aWVzKSwgbWluaW11bSAnICsgbWluUHJvcGVydGllcyk7XG4gIH1cbn07XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoZSB2YWx1ZSBpcyBhIG11bHRpcGxlIG9mIHRoZSBwcm92aWRlZCBudW1iZXIgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0geypbXX0gdmFsIC0gVGhlIHBhcmFtZXRlciB2YWx1ZVxuICogQHBhcmFtIHtudW1iZXJ9IG11bHRpcGxlT2YgLSBUaGUgbnVtYmVyIHRoYXQgc2hvdWxkIGRpdmlkZSBldmVubHkgaW50byB0aGUgdmFsdWVcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSB2YWx1ZSBjb250YWlucyBmZXdlciBpdGVtcyB0aGFuIGFsbG93YWJsZVxuICovXG52YXIgdmFsaWRhdGVNdWx0aXBsZU9mID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVNdWx0aXBsZU9mID0gZnVuY3Rpb24gKHZhbCwgbXVsdGlwbGVPZikge1xuICBpZiAoIV8uaXNVbmRlZmluZWQobXVsdGlwbGVPZikgJiYgdmFsICUgbXVsdGlwbGVPZiAhPT0gMCkge1xuICAgIHRocm93RXJyb3JXaXRoQ29kZSgnTVVMVElQTEVfT0YnLCAnTm90IGEgbXVsdGlwbGUgb2YgJyArIG11bHRpcGxlT2YpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgbWF0Y2hlcyBhIHBhdHRlcm4gKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSAtIFRoZSBwYXJhbWV0ZXIgbmFtZVxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge3N0cmluZ30gcGF0dGVybiAtIFRoZSBwYXR0ZXJuXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgdmFsdWUgZG9lcyBub3QgbWF0Y2ggdGhlIHBhdHRlcm5cbiAqL1xudmFyIHZhbGlkYXRlUGF0dGVybiA9IG1vZHVsZS5leHBvcnRzLnZhbGlkYXRlUGF0dGVybiA9IGZ1bmN0aW9uICh2YWwsIHBhdHRlcm4pIHtcbiAgaWYgKCFfLmlzVW5kZWZpbmVkKHBhdHRlcm4pICYmIF8uaXNOdWxsKHZhbC5tYXRjaChuZXcgUmVnRXhwKHBhdHRlcm4pKSkpIHtcbiAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ1BBVFRFUk4nLCAnRG9lcyBub3QgbWF0Y2ggcmVxdWlyZWQgcGF0dGVybjogJyArIHBhdHRlcm4pO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgcmVxdWlyZWRuZXNzICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHsqfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IHJlcXVpcmVkIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciBpcyByZXF1aXJlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIHJlcXVpcmVkIGJ1dCBpcyBub3QgcHJlc2VudFxuICovXG5tb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVJlcXVpcmVkbmVzcyA9IGZ1bmN0aW9uICh2YWwsIHJlcXVpcmVkKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChyZXF1aXJlZCkgJiYgcmVxdWlyZWQgPT09IHRydWUgJiYgXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdSRVFVSVJFRCcsICdJcyByZXF1aXJlZCcpO1xuICB9XG59O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdHlwZSBhbmQgZm9ybWF0ICh3aGVuIG5lY2Vzc2FyeSkuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHZlcnNpb24gLSBUaGUgU3dhZ2dlciB2ZXJzaW9uXG4gKiBAcGFyYW0geyp9IHZhbCAtIFRoZSBwYXJhbWV0ZXIgdmFsdWVcbiAqIEBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gVGhlIHBhcmFtZXRlciB0eXBlXG4gKiBAcGFyYW0ge3N0cmluZ30gZm9ybWF0IC0gVGhlIHBhcmFtZXRlciBmb3JtYXRcbiAqIEBwYXJhbSB7Ym9vbGVhbn0gW3NraXBFcnJvcj1mYWxzZV0gLSBXaGV0aGVyIG9yIG5vdCB0byBza2lwIHRocm93aW5nIGFuIGVycm9yIChVc2VmdWwgZm9yIHZhbGlkYXRpbmcgYXJyYXlzKVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGlzIG5vdCB0aGUgcHJvcGVyIHR5cGUgb3IgZm9ybWF0XG4gKi9cbnZhciB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPSBtb2R1bGUuZXhwb3J0cy52YWxpZGF0ZVR5cGVBbmRGb3JtYXQgPVxuICBmdW5jdGlvbiB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQgKHZlcnNpb24sIHZhbCwgdHlwZSwgZm9ybWF0LCBhbGxvd0VtcHR5VmFsdWUsIHNraXBFcnJvcikge1xuICAgIHZhciByZXN1bHQgPSB0cnVlO1xuICAgIHZhciBvVmFsID0gdmFsO1xuXG4gICAgLy8gSWYgdGhlcmUgaXMgYW4gZW1wdHkgdmFsdWUgYW5kIHdlIGFsbG93IGVtcHR5IHZhbHVlcywgdGhlIHZhbHVlIGlzIGFsd2F5cyB2YWxpZFxuICAgIGlmIChhbGxvd0VtcHR5VmFsdWUgPT09IHRydWUgJiYgdmFsID09PSAnJykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChfLmlzQXJyYXkodmFsKSkge1xuICAgICAgXy5lYWNoKHZhbCwgZnVuY3Rpb24gKGFWYWwsIGluZGV4KSB7XG4gICAgICAgIGlmICghdmFsaWRhdGVUeXBlQW5kRm9ybWF0KHZlcnNpb24sIGFWYWwsIHR5cGUsIGZvcm1hdCwgYWxsb3dFbXB0eVZhbHVlLCB0cnVlKSkge1xuICAgICAgICAgIHRocm93RXJyb3JXaXRoQ29kZSgnSU5WQUxJRF9UWVBFJywgJ1ZhbHVlIGF0IGluZGV4ICcgKyBpbmRleCArICcgaXMgbm90IGEgdmFsaWQgJyArIHR5cGUgKyAnOiAnICsgYVZhbCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzd2l0Y2ggKHR5cGUpIHtcbiAgICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgICAvLyBDb2VyY2UgdGhlIHZhbHVlIG9ubHkgZm9yIFN3YWdnZXIgMS4yXG4gICAgICAgIGlmICh2ZXJzaW9uID09PSAnMS4yJyAmJiBfLmlzU3RyaW5nKHZhbCkpIHtcbiAgICAgICAgICBpZiAodmFsID09PSAnZmFsc2UnKSB7XG4gICAgICAgICAgICB2YWwgPSBmYWxzZTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHZhbCA9PT0gJ3RydWUnKSB7XG4gICAgICAgICAgICB2YWwgPSB0cnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdCA9IF8uaXNCb29sZWFuKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW50ZWdlcic6XG4gICAgICAgIC8vIENvZXJjZSB0aGUgdmFsdWUgb25seSBmb3IgU3dhZ2dlciAxLjJcbiAgICAgICAgaWYgKHZlcnNpb24gPT09ICcxLjInICYmIF8uaXNTdHJpbmcodmFsKSkge1xuICAgICAgICAgIHZhbCA9IE51bWJlcih2YWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0ID0gXy5pc0Zpbml0ZSh2YWwpICYmIChNYXRoLnJvdW5kKHZhbCkgPT09IHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgICAgLy8gQ29lcmNlIHRoZSB2YWx1ZSBvbmx5IGZvciBTd2FnZ2VyIDEuMlxuICAgICAgICBpZiAodmVyc2lvbiA9PT0gJzEuMicgJiYgXy5pc1N0cmluZyh2YWwpKSB7XG4gICAgICAgICAgdmFsID0gTnVtYmVyKHZhbCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXN1bHQgPSBfLmlzRmluaXRlKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgaWYgKCFfLmlzVW5kZWZpbmVkKGZvcm1hdCkpIHtcbiAgICAgICAgICBzd2l0Y2ggKGZvcm1hdCkge1xuICAgICAgICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgICAgICAgcmVzdWx0ID0gaXNWYWxpZERhdGUodmFsKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgJ2RhdGUtdGltZSc6XG4gICAgICAgICAgICByZXN1bHQgPSBpc1ZhbGlkRGF0ZVRpbWUodmFsKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3ZvaWQnOlxuICAgICAgICByZXN1bHQgPSBfLmlzVW5kZWZpbmVkKHZhbCk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChza2lwRXJyb3IpIHtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfSBlbHNlIGlmICghcmVzdWx0KSB7XG4gICAgICB0aHJvd0Vycm9yV2l0aENvZGUoJ0lOVkFMSURfVFlQRScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSAhPT0gJ3ZvaWQnID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICdOb3QgYSB2YWxpZCAnICsgKF8uaXNVbmRlZmluZWQoZm9ybWF0KSA/ICcnIDogZm9ybWF0ICsgJyAnKSArIHR5cGUgKyAnOiAnICsgb1ZhbCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAnVm9pZCBkb2VzIG5vdCBhbGxvdyBhIHZhbHVlJyk7XG4gICAgfVxuICB9O1xuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGUgdmFsdWUgdmFsdWVzIGFyZSB1bmlxdWUgKHdoZW4gbmVjZXNzYXJ5KS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSB2YWwgLSBUaGUgcGFyYW1ldGVyIHZhbHVlXG4gKiBAcGFyYW0ge2Jvb2xlYW59IGlzVW5pcXVlIC0gV2hldGhlciBvciBub3QgdGhlIHBhcmFtZXRlciB2YWx1ZXMgYXJlIHVuaXF1ZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIHZhbHVlIGhhcyBkdXBsaWNhdGVzXG4gKi9cbnZhciB2YWxpZGF0ZVVuaXF1ZUl0ZW1zID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVVbmlxdWVJdGVtcyA9IGZ1bmN0aW9uICh2YWwsIGlzVW5pcXVlKSB7XG4gIGlmICghXy5pc1VuZGVmaW5lZChpc1VuaXF1ZSkgJiYgXy51bmlxKHZhbCkubGVuZ3RoICE9PSB2YWwubGVuZ3RoKSB7XG4gICAgdGhyb3dFcnJvcldpdGhDb2RlKCdBUlJBWV9VTklRVUUnLCAnRG9lcyBub3QgYWxsb3cgZHVwbGljYXRlIHZhbHVlczogJyArIHZhbC5qb2luKCcsICcpKTtcbiAgfVxufTtcblxuLyoqXG4gKiBWYWxpZGF0ZXMgdGhlIHZhbHVlIGFnYWluc3QgdGhlIHNjaGVtYS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmVyc2lvbiAtIFRoZSBTd2FnZ2VyIHZlcnNpb25cbiAqIEBwYXJhbSB7b2JqZWN0fSBzY2hlbWEgLSBUaGUgc2NoZW1hIHRvIHVzZSB0byB2YWxpZGF0ZSB0aGluZ3NcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCB0byB0aGUgc2NoZW1hXG4gKiBAcGFyYW0geyp9IFt2YWxdIC0gVGhlIHZhbHVlIHRvIHZhbGlkYXRlIG9yIHVuZGVmaW5lZCB0byB1c2UgdGhlIGRlZmF1bHQgdmFsdWUgcHJvdmlkZWQgYnkgdGhlIHNjaGVtYVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgYW55IHZhbGlkYXRpb24gZmFpbGVzXG4gKi9cbnZhciB2YWxpZGF0ZVNjaGVtYUNvbnN0cmFpbnRzID0gbW9kdWxlLmV4cG9ydHMudmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyA9IGZ1bmN0aW9uICh2ZXJzaW9uLCBzY2hlbWEsIHBhdGgsIHZhbCkge1xuICB2YXIgcmVzb2x2ZVNjaGVtYSA9IGZ1bmN0aW9uIChzY2hlbWEpIHtcbiAgICB2YXIgcmVzb2x2ZWQgPSBzY2hlbWE7XG5cbiAgICBpZiAocmVzb2x2ZWQuc2NoZW1hKSB7XG4gICAgICBwYXRoID0gcGF0aC5jb25jYXQoWydzY2hlbWEnXSk7XG5cbiAgICAgIHJlc29sdmVkID0gcmVzb2x2ZVNjaGVtYShyZXNvbHZlZC5zY2hlbWEpO1xuICAgIH1cblxuICAgIHJldHVybiByZXNvbHZlZDtcbiAgfTtcblxuICB2YXIgdHlwZSA9IHNjaGVtYS50eXBlO1xuICB2YXIgYWxsb3dFbXB0eVZhbHVlO1xuXG4gIGlmICghdHlwZSkge1xuICAgIGlmICghc2NoZW1hLnNjaGVtYSkge1xuICAgICAgaWYgKHBhdGhbcGF0aC5sZW5ndGggLSAyXSA9PT0gJ3Jlc3BvbnNlcycpIHtcbiAgICAgICAgdHlwZSA9ICd2b2lkJztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR5cGUgPSAnb2JqZWN0JztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2NoZW1hID0gcmVzb2x2ZVNjaGVtYShzY2hlbWEpO1xuICAgICAgdHlwZSA9IHNjaGVtYS50eXBlIHx8ICdvYmplY3QnO1xuICAgIH1cbiAgfVxuXG4gIGFsbG93RW1wdHlWYWx1ZSA9IHNjaGVtYSA/IHNjaGVtYS5hbGxvd0VtcHR5VmFsdWUgPT09IHRydWUgOiBmYWxzZTtcblxuICB0cnkge1xuICAgIC8vIEFsd2F5cyBwZXJmb3JtIHRoaXMgY2hlY2sgZXZlbiBpZiB0aGVyZSBpcyBubyB2YWx1ZVxuICAgIGlmICh0eXBlID09PSAnYXJyYXknKSB7XG4gICAgICB2YWxpZGF0ZUFycmF5VHlwZShzY2hlbWEpO1xuICAgIH1cblxuICAgIC8vIERlZmF1bHQgdG8gZGVmYXVsdCB2YWx1ZSBpZiBuZWNlc3NhcnlcbiAgICBpZiAoXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgICB2YWwgPSB2ZXJzaW9uID09PSAnMS4yJyA/IHNjaGVtYS5kZWZhdWx0VmFsdWUgOiBzY2hlbWEuZGVmYXVsdDtcblxuICAgICAgcGF0aCA9IHBhdGguY29uY2F0KFt2ZXJzaW9uID09PSAnMS4yJyA/ICdkZWZhdWx0VmFsdWUnIDogJ2RlZmF1bHQnXSk7XG4gICAgfVxuXG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gZXhwbGljaXQgZGVmYXVsdCB2YWx1ZSwgcmV0dXJuIGFzIGFsbCB2YWxpZGF0aW9ucyB3aWxsIGZhaWxcbiAgICBpZiAoXy5pc1VuZGVmaW5lZCh2YWwpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKHR5cGUgPT09ICdhcnJheScpIHtcbiAgICAgIF8uZWFjaCh2YWwsIGZ1bmN0aW9uICh2YWwsIGluZGV4KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdmFsaWRhdGVTY2hlbWFDb25zdHJhaW50cyh2ZXJzaW9uLCBzY2hlbWEuaXRlbXMgfHwge30sIHBhdGguY29uY2F0KGluZGV4LnRvU3RyaW5nKCkpLCB2YWwpO1xuICAgICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgICBlcnIubWVzc2FnZSA9ICdWYWx1ZSBhdCBpbmRleCAnICsgaW5kZXggKyAnICcgKyAoZXJyLmNvZGUgPT09ICdJTlZBTElEX1RZUEUnID8gJ2lzICcgOiAnJykgK1xuICAgICAgICAgICAgZXJyLm1lc3NhZ2UuY2hhckF0KDApLnRvTG93ZXJDYXNlKCkgKyBlcnIubWVzc2FnZS5zdWJzdHJpbmcoMSk7XG5cbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWxpZGF0ZVR5cGVBbmRGb3JtYXQodmVyc2lvbiwgdmFsLCB0eXBlLCBzY2hlbWEuZm9ybWF0LCBhbGxvd0VtcHR5VmFsdWUpO1xuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIGVudW1cbiAgICB2YWxpZGF0ZUVudW0odmFsLCBzY2hlbWEuZW51bSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhpbXVtXG4gICAgdmFsaWRhdGVNYXhpbXVtKHZhbCwgc2NoZW1hLm1heGltdW0sIHR5cGUsIHNjaGVtYS5leGNsdXNpdmVNYXhpbXVtKTtcblxuXG4gICAgLy8gVmFsaWRhdGUgbWF4SXRlbXMgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1heEl0ZW1zKHZhbCwgc2NoZW1hLm1heEl0ZW1zKTtcblxuICAgIC8vIFZhbGlkYXRlIG1heExlbmd0aCAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlTWF4TGVuZ3RoKHZhbCwgc2NoZW1hLm1heExlbmd0aCk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtYXhQcm9wZXJ0aWVzIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNYXhQcm9wZXJ0aWVzKHZhbCwgc2NoZW1hLm1heFByb3BlcnRpZXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluaW11bVxuICAgIHZhbGlkYXRlTWluaW11bSh2YWwsIHNjaGVtYS5taW5pbXVtLCB0eXBlLCBzY2hlbWEuZXhjbHVzaXZlTWluaW11bSk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtaW5JdGVtc1xuICAgIHZhbGlkYXRlTWluSXRlbXModmFsLCBzY2hlbWEubWluSXRlbXMpO1xuXG4gICAgLy8gVmFsaWRhdGUgbWluTGVuZ3RoIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNaW5MZW5ndGgodmFsLCBzY2hlbWEubWluTGVuZ3RoKTtcblxuICAgIC8vIFZhbGlkYXRlIG1pblByb3BlcnRpZXMgKFN3YWdnZXIgMi4wKylcbiAgICB2YWxpZGF0ZU1pblByb3BlcnRpZXModmFsLCBzY2hlbWEubWluUHJvcGVydGllcyk7XG5cbiAgICAvLyBWYWxpZGF0ZSBtdWx0aXBsZU9mIChTd2FnZ2VyIDIuMCspXG4gICAgdmFsaWRhdGVNdWx0aXBsZU9mKHZhbCwgc2NoZW1hLm11bHRpcGxlT2YpO1xuXG4gICAgLy8gVmFsaWRhdGUgcGF0dGVybiAoU3dhZ2dlciAyLjArKVxuICAgIHZhbGlkYXRlUGF0dGVybih2YWwsIHNjaGVtYS5wYXR0ZXJuKTtcblxuICAgIC8vIFZhbGlkYXRlIHVuaXF1ZUl0ZW1zXG4gICAgdmFsaWRhdGVVbmlxdWVJdGVtcyh2YWwsIHNjaGVtYS51bmlxdWVJdGVtcyk7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGVyci5wYXRoID0gcGF0aDtcblxuICAgIHRocm93IGVycjtcbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9hcGlEZWNsYXJhdGlvbi5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcInN3YWdnZXJWZXJzaW9uXCIsIFwiYmFzZVBhdGhcIiwgXCJhcGlzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInN3YWdnZXJWZXJzaW9uXCI6IHsgXCJlbnVtXCI6IFsgXCIxLjJcIiBdIH0sXG4gICAgICAgIFwiYXBpVmVyc2lvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiYmFzZVBhdGhcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiLFxuICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXmh0dHBzPzovL1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVzb3VyY2VQYXRoXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIixcbiAgICAgICAgICAgIFwicGF0dGVyblwiOiBcIl4vXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhcGlzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlPYmplY3RcIiB9XG4gICAgICAgIH0sXG4gICAgICAgIFwibW9kZWxzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwibW9kZWxzT2JqZWN0Lmpzb24jXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9kdWNlc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgIFwiY29uc3VtZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbWVUeXBlQXJyYXlcIiB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25zXCI6IHsgXCIkcmVmXCI6IFwiYXV0aG9yaXphdGlvbk9iamVjdC5qc29uI1wiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwiYXBpT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwicGF0aFwiLCBcIm9wZXJhdGlvbnNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInBhdGhcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmktdGVtcGxhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJvcGVyYXRpb25zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcIm9wZXJhdGlvbk9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbWVUeXBlQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwibWltZS10eXBlXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9hdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYmFzaWNBdXRoXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9hcGlLZXlcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlwiXG4gICAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICB9LFxuICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICBcImJhc2ljQXV0aFwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJiYXNpY0F1dGhcIiBdIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiYXBpS2V5XCI6IHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInR5cGVcIiwgXCJwYXNzQXNcIiwgXCJrZXluYW1lXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJhcGlLZXlcIiBdIH0sXG4gICAgICAgICAgICAgICAgXCJwYXNzQXNcIjogeyBcImVudW1cIjogWyBcImhlYWRlclwiLCBcInF1ZXJ5XCIgXSB9LFxuICAgICAgICAgICAgICAgIFwia2V5bmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwib2F1dGgyXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiLCBcImdyYW50VHlwZXNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcIm9hdXRoMlwiIF0gfSxcbiAgICAgICAgICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlNjb3BlXCIgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJncmFudFR5cGVzXCI6IHsgXCIkcmVmXCI6IFwib2F1dGgyR3JhbnRUeXBlLmpzb24jXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJvYXV0aDJTY29wZVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInNjb3BlXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJzY29wZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG59XG5cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9kYXRhVHlwZS5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwiZGVzY3JpcHRpb25cIjogXCJEYXRhIHR5cGUgYXMgZGVzY3JpYmVkIGJ5IHRoZSBzcGVjaWZpY2F0aW9uICh2ZXJzaW9uIDEuMilcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JlZlR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdm9pZFR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlVHlwZVwiIH0sXG4gICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tb2RlbFR5cGVcIiB9LFxuICAgICAgICB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXJyYXlUeXBlXCIgfVxuICAgIF0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwicmVmVHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCIkcmVmXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCIkcmVmXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ2b2lkVHlwZVwiOiB7XG4gICAgICAgICAgICBcImVudW1cIjogWyB7IFwidHlwZVwiOiBcInZvaWRcIiB9IF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtb2RlbFR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcIm5vdFwiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJvb2xlYW5cIiwgXCJpbnRlZ2VyXCIsIFwibnVtYmVyXCIsIFwic3RyaW5nXCIsIFwiYXJyYXlcIiBdXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcInByaW1pdGl2ZVR5cGVcIjoge1xuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwiZW51bVwiOiBbIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudW1iZXJcIiwgXCJzdHJpbmdcIiBdXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJkZWZhdWx0VmFsdWVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcIm5vdFwiOiB7IFwidHlwZVwiOiBbIFwiYXJyYXlcIiwgXCJvYmplY3RcIiwgXCJudWxsXCIgXSB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibWluaW11bVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJtYXhpbXVtXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICAgICAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJpbnQzMlwiLCBcImludDY0XCIgXSB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcIm51bWJlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjogeyBcImVudW1cIjogWyBcImZsb2F0XCIsIFwiZG91YmxlXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJlbnVtXCI6IFsgXCJieXRlXCIsIFwiZGF0ZVwiLCBcImRhdGUtdGltZVwiIF1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwic3RyaW5nXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiwgXCJudW1iZXJcIiBdIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwiZW51bVwiOiBbIFwiaW50ZWdlclwiLCBcIm51bWJlclwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImFycmF5VHlwZVwiOiB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ0eXBlXCIsIFwiaXRlbXNcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImFycmF5XCIgXSB9LFxuICAgICAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pdGVtc09iamVjdFwiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc09iamVjdFwiOiB7XG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVmVHlwZVwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlVHlwZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7fSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJmb3JtYXRcIjoge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfVxuICAgIH1cbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvZGF0YVR5cGVCYXNlLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkRhdGEgdHlwZSBmaWVsZHMgKHNlY3Rpb24gNC4zLjMpXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHsgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0gfSxcbiAgICAgICAgeyBcInJlcXVpcmVkXCI6IFsgXCIkcmVmXCIgXSB9XG4gICAgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcIiRyZWZcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZGVmYXVsdFZhbHVlXCI6IHtcbiAgICAgICAgICAgIFwibm90XCI6IHsgXCJ0eXBlXCI6IFsgXCJhcnJheVwiLCBcIm9iamVjdFwiLCBcIm51bGxcIiBdIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZSxcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcIm1heGltdW1cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9pdGVtc09iamVjdFwiIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjogeyBcInR5cGVcIjogXCJib29sZWFuXCIgfVxuICAgIH0sXG4gICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcImludGVnZXJcIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7IFwiZW51bVwiOiBbIFwiaW50MzJcIiwgXCJpbnQ2NFwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcIm51bWJlclwiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHsgXCJlbnVtXCI6IFsgXCJmbG9hdFwiLCBcImRvdWJsZVwiIF0gfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogeyBcImVudW1cIjogWyBcInN0cmluZ1wiIF0gfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcImJ5dGVcIiwgXCJkYXRlXCIsIFwiZGF0ZS10aW1lXCIgXVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJpdGVtc09iamVjdFwiOiB7XG4gICAgICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCIkcmVmXCIgXSxcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwidHlwZVwiIF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImZvcm1hdFwiOiB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBdXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL2luZm9PYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcImRlc2NyaXB0aW9uXCI6IFwiaW5mbyBvYmplY3QgKHNlY3Rpb24gNS4xLjMpXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwidGl0bGVcIiwgXCJkZXNjcmlwdGlvblwiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0aXRsZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcInRlcm1zT2ZTZXJ2aWNlVXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgXCJjb250YWN0XCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwiZW1haWxcIiB9LFxuICAgICAgICBcImxpY2Vuc2VcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImxpY2Vuc2VVcmxcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJmb3JtYXRcIjogXCJ1cmlcIiB9XG4gICAgfSxcbiAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL21vZGVsc09iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwicmVxdWlyZWRcIjogWyBcImlkXCIsIFwicHJvcGVydGllc1wiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJpZFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcm9wZXJ0eU9iamVjdFwiIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzdWJUeXBlc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJkaXNjcmltaW5hdG9yXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgIH0sXG4gICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICBcInN1YlR5cGVzXCI6IFsgXCJkaXNjcmltaW5hdG9yXCIgXVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwicHJvcGVydHlPYmplY3RcIjoge1xuICAgICAgICAgICAgXCJhbGxPZlwiOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcIm5vdFwiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIFwiJHJlZlwiOiBcImRhdGFUeXBlQmFzZS5qc29uI1wiXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9XG4gICAgfVxufVxuXG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvb2F1dGgyR3JhbnRUeXBlLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJtaW5Qcm9wZXJ0aWVzXCI6IDEsXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJpbXBsaWNpdFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaW1wbGljaXRcIiB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25fY29kZVwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvYXV0aG9yaXphdGlvbkNvZGVcIiB9XG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgICAgXCJpbXBsaWNpdFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcImxvZ2luRW5kcG9pbnRcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImxvZ2luRW5kcG9pbnRcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2xvZ2luRW5kcG9pbnRcIiB9LFxuICAgICAgICAgICAgICAgIFwidG9rZW5OYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uQ29kZVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInRva2VuRW5kcG9pbnRcIiwgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidG9rZW5FbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdG9rZW5FbmRwb2ludFwiIH0sXG4gICAgICAgICAgICAgICAgXCJ0b2tlblJlcXVlc3RFbmRwb2ludFwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdG9rZW5SZXF1ZXN0RW5kcG9pbnRcIiB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImxvZ2luRW5kcG9pbnRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5FbmRwb2ludFwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcInVybFwiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwidXJsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgICAgICAgICBcInRva2VuTmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5SZXF1ZXN0RW5kcG9pbnRcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJ1cmxcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcInVybFwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiLCBcImZvcm1hdFwiOiBcInVyaVwiIH0sXG4gICAgICAgICAgICAgICAgXCJjbGllbnRJZE5hbWVcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICAgICAgICAgIFwiY2xpZW50U2VjcmV0TmFtZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICB9XG59IiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL29wZXJhdGlvbk9iamVjdC5qc29uI1wiLFxuICAgIFwiJHNjaGVtYVwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hI1wiLFxuICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgIFwiYWxsT2ZcIjogW1xuICAgICAgICB7IFwiJHJlZlwiOiBcImRhdGFUeXBlQmFzZS5qc29uI1wiIH0sXG4gICAgICAgIHtcbiAgICAgICAgICAgIFwicmVxdWlyZWRcIjogWyBcIm1ldGhvZFwiLCBcIm5pY2tuYW1lXCIsIFwicGFyYW1ldGVyc1wiIF0sXG4gICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgIFwibWV0aG9kXCI6IHsgXCJlbnVtXCI6IFsgXCJHRVRcIiwgXCJIRUFEXCIsIFwiUE9TVFwiLCBcIlBVVFwiLCBcIlBBVENIXCIsIFwiREVMRVRFXCIsIFwiT1BUSU9OU1wiIF0gfSxcbiAgICAgICAgICAgICAgICBcInN1bW1hcnlcIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiwgXCJtYXhMZW5ndGhcIjogMTIwIH0sXG4gICAgICAgICAgICAgICAgXCJub3Rlc1wiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJuaWNrbmFtZVwiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgICAgICBcInBhdHRlcm5cIjogXCJeW2EtekEtWjAtOV9dKyRcIlxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCJhdXRob3JpemF0aW9uT2JqZWN0Lmpzb24jL2RlZmluaXRpb25zL29hdXRoMlNjb3BlXCJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcInBhcmFtZXRlck9iamVjdC5qc29uI1wiIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIFwicmVzcG9uc2VNZXNzYWdlc1wiOiB7XG4gICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Jlc3BvbnNlTWVzc2FnZU9iamVjdFwifVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJwcm9kdWNlc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgICAgICAgICAgXCJjb25zdW1lc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWltZVR5cGVBcnJheVwiIH0sXG4gICAgICAgICAgICAgICAgXCJkZXByZWNhdGVkXCI6IHsgXCJlbnVtXCI6IFsgXCJ0cnVlXCIsIFwiZmFsc2VcIiBdIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIF0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwicmVzcG9uc2VNZXNzYWdlT2JqZWN0XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJyZXF1aXJlZFwiOiBbIFwiY29kZVwiLCBcIm1lc3NhZ2VcIiBdLFxuICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImNvZGVcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3JmYzI2MTZzZWN0aW9uMTBcIiB9LFxuICAgICAgICAgICAgICAgIFwibWVzc2FnZVwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH0sXG4gICAgICAgICAgICAgICAgXCJyZXNwb25zZU1vZGVsXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInJmYzI2MTZzZWN0aW9uMTBcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJtaW5pbXVtXCI6IDEwMCxcbiAgICAgICAgICAgIFwibWF4aW11bVwiOiA2MDAsXG4gICAgICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcIm1pbWVUeXBlQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwibWltZS10eXBlXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL3dvcmRuaWsuZ2l0aHViLmlvL3NjaGVtYXMvdjEuMi9wYXJhbWV0ZXJPYmplY3QuanNvbiNcIixcbiAgICBcIiRzY2hlbWFcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSNcIixcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcImFsbE9mXCI6IFtcbiAgICAgICAgeyBcIiRyZWZcIjogXCJkYXRhVHlwZUJhc2UuanNvbiNcIiB9LFxuICAgICAgICB7XG4gICAgICAgICAgICBcInJlcXVpcmVkXCI6IFsgXCJwYXJhbVR5cGVcIiwgXCJuYW1lXCIgXSxcbiAgICAgICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjoge1xuICAgICAgICAgICAgICAgICAgICBcImVudW1cIjogWyBcInBhdGhcIiwgXCJxdWVyeVwiLCBcImJvZHlcIiwgXCJoZWFkZXJcIiwgXCJmb3JtXCIgXVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgXCJuYW1lXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH0sXG4gICAgICAgICAgICAgICAgXCJhbGxvd011bHRpcGxlXCI6IHsgXCJ0eXBlXCI6IFwiYm9vbGVhblwiIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcInR5cGUgRmlsZSByZXF1aXJlcyBzcGVjaWFsIHBhcmFtVHlwZSBhbmQgY29uc3VtZXNcIixcbiAgICAgICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIFwidHlwZVwiOiB7IFwibm90XCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgICAgICAgICAgICAgXCJ0eXBlXCI6IHsgXCJlbnVtXCI6IFsgXCJGaWxlXCIgXSB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgXCJwYXJhbVR5cGVcIjogeyBcImVudW1cIjogWyBcImZvcm1cIiBdIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBcImNvbnN1bWVzXCI6IHsgXCJlbnVtXCI6IFsgXCJtdWx0aXBhcnQvZm9ybS1kYXRhXCIgXSB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH1cbiAgICBdXG59XG4iLCJtb2R1bGUuZXhwb3J0cz17XG4gICAgXCJpZFwiOiBcImh0dHA6Ly93b3JkbmlrLmdpdGh1Yi5pby9zY2hlbWFzL3YxLjIvcmVzb3VyY2VMaXN0aW5nLmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwic3dhZ2dlclZlcnNpb25cIiwgXCJhcGlzXCIgXSxcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInN3YWdnZXJWZXJzaW9uXCI6IHsgXCJlbnVtXCI6IFsgXCIxLjJcIiBdIH0sXG4gICAgICAgIFwiYXBpc1wiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJpdGVtc1wiOiB7IFwiJHJlZlwiOiBcInJlc291cmNlT2JqZWN0Lmpzb24jXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcImFwaVZlcnNpb25cIjogeyBcInR5cGVcIjogXCJzdHJpbmdcIiB9LFxuICAgICAgICBcImluZm9cIjogeyBcIiRyZWZcIjogXCJpbmZvT2JqZWN0Lmpzb24jXCIgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uc1wiOiB7IFwiJHJlZlwiOiBcImF1dGhvcml6YXRpb25PYmplY3QuanNvbiNcIiB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwiaWRcIjogXCJodHRwOi8vd29yZG5pay5naXRodWIuaW8vc2NoZW1hcy92MS4yL3Jlc291cmNlT2JqZWN0Lmpzb24jXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgXCJyZXF1aXJlZFwiOiBbIFwicGF0aFwiIF0sXG4gICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJwYXRoXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIsIFwiZm9ybWF0XCI6IFwidXJpXCIgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7IFwidHlwZVwiOiBcInN0cmluZ1wiIH1cbiAgICB9LFxuICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2Vcbn0iLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwidGl0bGVcIjogXCJBIEpTT04gU2NoZW1hIGZvciBTd2FnZ2VyIDIuMCBBUEkuXCIsXG4gIFwiaWRcIjogXCJodHRwOi8vc3dhZ2dlci5pby92Mi9zY2hlbWEuanNvbiNcIixcbiAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICBcInJlcXVpcmVkXCI6IFtcbiAgICBcInN3YWdnZXJcIixcbiAgICBcImluZm9cIixcbiAgICBcInBhdGhzXCJcbiAgXSxcbiAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgXCJeeC1cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgIH1cbiAgfSxcbiAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICBcInN3YWdnZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcIjIuMFwiXG4gICAgICBdLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlRoZSBTd2FnZ2VyIHZlcnNpb24gb2YgdGhpcyBkb2N1bWVudC5cIlxuICAgIH0sXG4gICAgXCJpbmZvXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaW5mb1wiXG4gICAgfSxcbiAgICBcImhvc3RcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcInBhdHRlcm5cIjogXCJeW157fS8gOlxcXFxcXFxcXSsoPzo6XFxcXGQrKT8kXCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIGhvc3QgKG5hbWUgb3IgaXApIG9mIHRoZSBBUEkuIEV4YW1wbGU6ICdzd2FnZ2VyLmlvJ1wiXG4gICAgfSxcbiAgICBcImJhc2VQYXRoXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgXCJwYXR0ZXJuXCI6IFwiXi9cIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgYmFzZSBwYXRoIHRvIHRoZSBBUEkuIEV4YW1wbGU6ICcvYXBpJy5cIlxuICAgIH0sXG4gICAgXCJzY2hlbWVzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgIH0sXG4gICAgXCJjb25zdW1lc1wiOiB7XG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgYWNjZXB0ZWQgYnkgdGhlIEFQSS5cIixcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWVkaWFUeXBlTGlzdFwiXG4gICAgfSxcbiAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGxpc3Qgb2YgTUlNRSB0eXBlcyB0aGUgQVBJIGNhbiBwcm9kdWNlLlwiLFxuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tZWRpYVR5cGVMaXN0XCJcbiAgICB9LFxuICAgIFwicGF0aHNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoc1wiXG4gICAgfSxcbiAgICBcImRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyRGVmaW5pdGlvbnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwic2VjdXJpdHlcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgfSxcbiAgICBcInNlY3VyaXR5RGVmaW5pdGlvbnNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eURlZmluaXRpb25zXCJcbiAgICB9LFxuICAgIFwidGFnc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdGFnXCJcbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICB9XG4gIH0sXG4gIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgIFwiaW5mb1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJHZW5lcmFsIGluZm9ybWF0aW9uIGFib3V0IHRoZSBBUEkuXCIsXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJ2ZXJzaW9uXCIsXG4gICAgICAgIFwidGl0bGVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIHVuaXF1ZSBhbmQgcHJlY2lzZSB0aXRsZSBvZiB0aGUgQVBJLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidmVyc2lvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgc2VtYW50aWMgdmVyc2lvbiBudW1iZXIgb2YgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIEFQSS4gU2hvdWxkIGJlIGRpZmZlcmVudCBmcm9tIHRoZSB0aXRsZS4gIEdpdEh1YiBGbGF2b3JlZCBNYXJrZG93biBpcyBhbGxvd2VkLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGVybXNPZlNlcnZpY2VcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgdGVybXMgb2Ygc2VydmljZSBmb3IgdGhlIEFQSS5cIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRhY3RcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29udGFjdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibGljZW5zZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9saWNlbnNlXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJjb250YWN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvbnRhY3QgaW5mb3JtYXRpb24gZm9yIHRoZSBvd25lcnMgb2YgdGhlIEFQSS5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgaWRlbnRpZnlpbmcgbmFtZSBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIFVSTCBwb2ludGluZyB0byB0aGUgY29udGFjdCBpbmZvcm1hdGlvbi5cIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW1haWxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgZW1haWwgYWRkcmVzcyBvZiB0aGUgY29udGFjdCBwZXJzb24vb3JnYW5pemF0aW9uLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwiZW1haWxcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwibGljZW5zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIlxuICAgICAgXSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgbGljZW5zZSB0eXBlLiBJdCdzIGVuY291cmFnZWQgdG8gdXNlIGFuIE9TSSBjb21wYXRpYmxlIGxpY2Vuc2UuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1cmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgVVJMIHBvaW50aW5nIHRvIHRoZSBsaWNlbnNlLlwiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcInBhdGhzXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIlJlbGF0aXZlIHBhdGhzIHRvIHRoZSBpbmRpdmlkdWFsIGVuZHBvaW50cy4gVGhleSBtdXN0IGJlIHJlbGF0aXZlIHRvIHRoZSAnYmFzZVBhdGgnLlwiLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiXi9cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0aEl0ZW1cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZVxuICAgIH0sXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICB9LFxuICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIk9uZSBvciBtb3JlIEpTT04gb2JqZWN0cyBkZXNjcmliaW5nIHRoZSBzY2hlbWFzIGJlaW5nIGNvbnN1bWVkIGFuZCBwcm9kdWNlZCBieSB0aGUgQVBJLlwiXG4gICAgfSxcbiAgICBcInBhcmFtZXRlckRlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcbiAgICAgIH0sXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiT25lIG9yIG1vcmUgSlNPTiByZXByZXNlbnRhdGlvbnMgZm9yIHBhcmFtZXRlcnNcIlxuICAgIH0sXG4gICAgXCJyZXNwb25zZURlZmluaXRpb25zXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgfSxcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJPbmUgb3IgbW9yZSBKU09OIHJlcHJlc2VudGF0aW9ucyBmb3IgcGFyYW1ldGVyc1wiXG4gICAgfSxcbiAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiaW5mb3JtYXRpb24gYWJvdXQgZXh0ZXJuYWwgZG9jdW1lbnRhdGlvblwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHRydWVcbiAgICB9LFxuICAgIFwibWltZVR5cGVcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIE1JTUUgdHlwZSBvZiB0aGUgSFRUUCBtZXNzYWdlLlwiXG4gICAgfSxcbiAgICBcIm9wZXJhdGlvblwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInJlc3BvbnNlc1wiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0YWdzXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBcInN1bW1hcnlcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIHN1bW1hcnkgb2YgdGhlIG9wZXJhdGlvbi5cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsb25nZXIgZGVzY3JpcHRpb24gb2YgdGhlIG9wZXJhdGlvbiwgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlcm5hbERvY3NcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXh0ZXJuYWxEb2NzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJvcGVyYXRpb25JZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkEgdW5pcXVlIGlkZW50aWZpZXIgb2YgdGhlIG9wZXJhdGlvbi5cIlxuICAgICAgICB9LFxuICAgICAgICBcInByb2R1Y2VzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gcHJvZHVjZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbnN1bWVzXCI6IHtcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBsaXN0IG9mIE1JTUUgdHlwZXMgdGhlIEFQSSBjYW4gY29uc3VtZS5cIixcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21lZGlhVHlwZUxpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhcmFtZXRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlc3BvbnNlc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1lc0xpc3RcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlcHJlY2F0ZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zZWN1cml0eVwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aEl0ZW1cIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIiRyZWZcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicHV0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicG9zdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlbGV0ZVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vcGVyYXRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcIm9wdGlvbnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJoZWFkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29wZXJhdGlvblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0Y2hcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb3BlcmF0aW9uXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXJhbWV0ZXJzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhcmFtZXRlcnNMaXN0XCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJyZXNwb25zZXNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiUmVzcG9uc2Ugb2JqZWN0cyBuYW1lcyBjYW4gZWl0aGVyIGJlIGFueSB2YWxpZCBIVFRQIHN0YXR1cyBjb2RlIG9yICdkZWZhdWx0Jy5cIixcbiAgICAgIFwibWluUHJvcGVydGllc1wiOiAxLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl4oWzAtOV17M30pJHxeKGRlZmF1bHQpJFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9yZXNwb25zZVZhbHVlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwibm90XCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicmVzcG9uc2VWYWx1ZVwiOiB7XG4gICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcmVzcG9uc2VcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9qc29uUmVmZXJlbmNlXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJyZXNwb25zZVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcImRlc2NyaXB0aW9uXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInNjaGVtYVwiOiB7XG4gICAgICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZmlsZVNjaGVtYVwiXG4gICAgICAgICAgICB9XG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImhlYWRlcnNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvaGVhZGVyc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhhbXBsZXNcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImhlYWRlcnNcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9oZWFkZXJcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJoZWFkZXJcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJhcnJheVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZvcm1hdFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wcmltaXRpdmVzSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImNvbGxlY3Rpb25Gb3JtYXRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvY29sbGVjdGlvbkZvcm1hdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmYXVsdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9kZWZhdWx0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhMZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5MZW5ndGhcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGF0dGVyblwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4SXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4SXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbkl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy91bmlxdWVJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9lbnVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL211bHRpcGxlT2ZcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwidmVuZG9yRXh0ZW5zaW9uXCI6IHtcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBbnkgcHJvcGVydHkgc3RhcnRpbmcgd2l0aCB4LSBpcyB2YWxpZC5cIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogdHJ1ZSxcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiYm9keVBhcmFtZXRlclwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcIm5hbWVcIixcbiAgICAgICAgXCJpblwiLFxuICAgICAgICBcInNjaGVtYVwiXG4gICAgICBdLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJib2R5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJzY2hlbWFcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwiaGVhZGVyUGFyYW1ldGVyU3ViU2NoZW1hXCI6IHtcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgdGhlIGxvY2F0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaGVhZGVyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRIdWIgRmxhdm9yZWQgTWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJxdWVyeVBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZXNjcmlwdGlvblwiOiBcIkRldGVybWluZXMgd2hldGhlciBvciBub3QgdGhpcyBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQgb3Igb3B0aW9uYWwuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwiaW5cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHRoZSBsb2NhdGlvbiBvZiB0aGUgcGFyYW1ldGVyLlwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInF1ZXJ5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRIdWIgRmxhdm9yZWQgTWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWxsb3dFbXB0eVZhbHVlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJhbGxvd3Mgc2VuZGluZyBhIHBhcmFtZXRlciBieSBuYW1lIG9ubHkgb3Igd2l0aCBhbiBlbXB0eSB2YWx1ZS5cIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxuICAgICAgICAgICAgXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiZm9ybURhdGFQYXJhbWV0ZXJTdWJTY2hlbWFcIjoge1xuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoaXMgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIG9yIG9wdGlvbmFsLlwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJmb3JtRGF0YVwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBicmllZiBkZXNjcmlwdGlvbiBvZiB0aGUgcGFyYW1ldGVyLiBUaGlzIGNvdWxkIGNvbnRhaW4gZXhhbXBsZXMgb2YgdXNlLiAgR2l0SHViIEZsYXZvcmVkIE1hcmtkb3duIGlzIGFsbG93ZWQuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlci5cIlxuICAgICAgICB9LFxuICAgICAgICBcImFsbG93RW1wdHlWYWx1ZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZSxcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiYWxsb3dzIHNlbmRpbmcgYSBwYXJhbWV0ZXIgYnkgbmFtZSBvbmx5IG9yIHdpdGggYW4gZW1wdHkgdmFsdWUuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwibnVtYmVyXCIsXG4gICAgICAgICAgICBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJhcnJheVwiLFxuICAgICAgICAgICAgXCJmaWxlXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0V2l0aE11bHRpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwicGF0aFBhcmFtZXRlclN1YlNjaGVtYVwiOiB7XG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInJlcXVpcmVkXCI6IFtcbiAgICAgICAgXCJyZXF1aXJlZFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJyZXF1aXJlZFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICB0cnVlXG4gICAgICAgICAgXSxcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGlzIHBhcmFtZXRlciBpcyByZXF1aXJlZCBvciBvcHRpb25hbC5cIlxuICAgICAgICB9LFxuICAgICAgICBcImluXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImRlc2NyaXB0aW9uXCI6IFwiRGV0ZXJtaW5lcyB0aGUgbG9jYXRpb24gb2YgdGhlIHBhcmFtZXRlci5cIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJwYXRoXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGJyaWVmIGRlc2NyaXB0aW9uIG9mIHRoZSBwYXJhbWV0ZXIuIFRoaXMgY291bGQgY29udGFpbiBleGFtcGxlcyBvZiB1c2UuICBHaXRIdWIgRmxhdm9yZWQgTWFya2Rvd24gaXMgYWxsb3dlZC5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyLlwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcIm51bWJlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImludGVnZXJcIixcbiAgICAgICAgICAgIFwiYXJyYXlcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiaXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcHJpbWl0aXZlc0l0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJjb2xsZWN0aW9uRm9ybWF0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2NvbGxlY3Rpb25Gb3JtYXRcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZGVmYXVsdFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNaW5pbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4TGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5MZW5ndGhcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluTGVuZ3RoXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heEl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW5JdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImVudW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tdWx0aXBsZU9mXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJub25Cb2R5UGFyYW1ldGVyXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiLFxuICAgICAgICBcImluXCIsXG4gICAgICAgIFwidHlwZVwiXG4gICAgICBdLFxuICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2hlYWRlclBhcmFtZXRlclN1YlNjaGVtYVwiXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Zvcm1EYXRhUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcXVlcnlQYXJhbWV0ZXJTdWJTY2hlbWFcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXRoUGFyYW1ldGVyU3ViU2NoZW1hXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJwYXJhbWV0ZXJcIjoge1xuICAgICAgXCJvbmVPZlwiOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2JvZHlQYXJhbWV0ZXJcIlxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9ub25Cb2R5UGFyYW1ldGVyXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0sXG4gICAgXCJzY2hlbWFcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiQSBkZXRlcm1pbmlzdGljIHZlcnNpb24gb2YgYSBKU09OIFNjaGVtYSBvYmplY3QuXCIsXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3RpdGxlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVzY3JpcHRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL211bHRpcGxlT2ZcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heExlbmd0aFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgICAgICB9LFxuICAgICAgICBcInBhdHRlcm5cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3BhdHRlcm5cIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heEl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdW5pcXVlSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1pblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicmVxdWlyZWRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZW51bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZW51bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3R5cGVcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgICAgXCJtaW5JdGVtc1wiOiAxLFxuICAgICAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiB7fVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hXCJcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkaXNjcmltaW5hdG9yXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlYWRPbmx5XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH0sXG4gICAgICAgIFwieG1sXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3htbFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXh0ZXJuYWxEb2NzXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2V4dGVybmFsRG9jc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhhbXBsZVwiOiB7fVxuICAgICAgfSxcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2VcbiAgICB9LFxuICAgIFwiZmlsZVNjaGVtYVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiZGVzY3JpcHRpb25cIjogXCJBIGRldGVybWluaXN0aWMgdmVyc2lvbiBvZiBhIEpTT04gU2NoZW1hIG9iamVjdC5cIixcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJmb3JtYXRcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3RpdGxlXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVzY3JpcHRpb25cIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXlcIlxuICAgICAgICB9LFxuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImZpbGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJyZWFkT25seVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwiYm9vbGVhblwiLFxuICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4YW1wbGVcIjoge31cbiAgICAgIH0sXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlXG4gICAgfSxcbiAgICBcInByaW1pdGl2ZXNJdGVtc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwiaW50ZWdlclwiLFxuICAgICAgICAgICAgXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImFycmF5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZm9ybWF0XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ByaW1pdGl2ZXNJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9jb2xsZWN0aW9uRm9ybWF0XCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2RlZmF1bHRcIlxuICAgICAgICB9LFxuICAgICAgICBcIm1heGltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWF4aW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leGNsdXNpdmVNYXhpbXVtXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbmltdW1cIlxuICAgICAgICB9LFxuICAgICAgICBcImV4Y2x1c2l2ZU1pbmltdW1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvZXhjbHVzaXZlTWluaW11bVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWF4TGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21heExlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL21pbkxlbmd0aFwiXG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wYXR0ZXJuXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9tYXhJdGVtc1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbWluSXRlbXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3VuaXF1ZUl0ZW1zXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2VudW1cIlxuICAgICAgICB9LFxuICAgICAgICBcIm11bHRpcGxlT2ZcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvbXVsdGlwbGVPZlwiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJzZWN1cml0eVwiOiB7XG4gICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2VjdXJpdHlSZXF1aXJlbWVudFwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNlY3VyaXR5UmVxdWlyZW1lbnRcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICB9XG4gICAgfSxcbiAgICBcInhtbFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjogZmFsc2UsXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm5hbWVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZXNwYWNlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcInByZWZpeFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdHRyaWJ1dGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJ3cmFwcGVkXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgXCJkZWZhdWx0XCI6IGZhbHNlXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJ0YWdcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwibmFtZVwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJuYW1lXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVybmFsRG9jc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9leHRlcm5hbERvY3NcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwic2VjdXJpdHlEZWZpbml0aW9uc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIm9uZU9mXCI6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2Jhc2ljQXV0aGVudGljYXRpb25TZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL2FwaUtleVNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgySW1wbGljaXRTZWN1cml0eVwiXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL29hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIlxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCJcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwiYmFzaWNBdXRoZW50aWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYmFzaWNcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcImFwaUtleVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJuYW1lXCIsXG4gICAgICAgIFwiaW5cIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBpS2V5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwibmFtZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJpblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiaGVhZGVyXCIsXG4gICAgICAgICAgICBcInF1ZXJ5XCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJJbXBsaWNpdFNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJpbXBsaWNpdFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcImF1dGhvcml6YXRpb25VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlBhc3N3b3JkU2VjdXJpdHlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IGZhbHNlLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwidHlwZVwiLFxuICAgICAgICBcImZsb3dcIixcbiAgICAgICAgXCJ0b2tlblVybFwiXG4gICAgICBdLFxuICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJvYXV0aDJcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJmbG93XCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImVudW1cIjogW1xuICAgICAgICAgICAgXCJwYXNzd29yZFwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcInNjb3Blc1wiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9vYXV0aDJTY29wZXNcIlxuICAgICAgICB9LFxuICAgICAgICBcInRva2VuVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBcInBhdHRlcm5Qcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgXCJeeC1cIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvdmVuZG9yRXh0ZW5zaW9uXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gICAgXCJvYXV0aDJBcHBsaWNhdGlvblNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwidG9rZW5VcmxcIlxuICAgICAgXSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwidHlwZVwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwib2F1dGgyXCJcbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIFwiZmxvd1wiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJlbnVtXCI6IFtcbiAgICAgICAgICAgIFwiYXBwbGljYXRpb25cIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b2tlblVybFwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlc2NyaXB0aW9uXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJwYXR0ZXJuUHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiXngtXCI6IHtcbiAgICAgICAgICBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3ZlbmRvckV4dGVuc2lvblwiXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIFwib2F1dGgyQWNjZXNzQ29kZVNlY3VyaXR5XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicmVxdWlyZWRcIjogW1xuICAgICAgICBcInR5cGVcIixcbiAgICAgICAgXCJmbG93XCIsXG4gICAgICAgIFwiYXV0aG9yaXphdGlvblVybFwiLFxuICAgICAgICBcInRva2VuVXJsXCJcbiAgICAgIF0sXG4gICAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcIm9hdXRoMlwiXG4gICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImZsb3dcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgICBcImFjY2Vzc0NvZGVcIlxuICAgICAgICAgIF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzY29wZXNcIjoge1xuICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvb2F1dGgyU2NvcGVzXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJhdXRob3JpemF0aW9uVXJsXCI6IHtcbiAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidG9rZW5VcmxcIjoge1xuICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgIFwiZm9ybWF0XCI6IFwidXJpXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICBcIl54LVwiOiB7XG4gICAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy92ZW5kb3JFeHRlbnNpb25cIlxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgICBcIm9hdXRoMlNjb3Blc1wiOiB7XG4gICAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgfVxuICAgIH0sXG4gICAgXCJtZWRpYVR5cGVMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9taW1lVHlwZVwiXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInBhcmFtZXRlcnNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHBhcmFtZXRlcnMgbmVlZGVkIHRvIHNlbmQgYSB2YWxpZCBBUEkgY2FsbC5cIixcbiAgICAgIFwiYWRkaXRpb25hbEl0ZW1zXCI6IGZhbHNlLFxuICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgIFwib25lT2ZcIjogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcGFyYW1ldGVyXCJcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvanNvblJlZmVyZW5jZVwiXG4gICAgICAgICAgfVxuICAgICAgICBdXG4gICAgICB9LFxuICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgfSxcbiAgICBcInNjaGVtZXNMaXN0XCI6IHtcbiAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICBcImRlc2NyaXB0aW9uXCI6IFwiVGhlIHRyYW5zZmVyIHByb3RvY29sIG9mIHRoZSBBUEkuXCIsXG4gICAgICBcIml0ZW1zXCI6IHtcbiAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgICAgXCJodHRwXCIsXG4gICAgICAgICAgXCJodHRwc1wiLFxuICAgICAgICAgIFwid3NcIixcbiAgICAgICAgICBcIndzc1wiXG4gICAgICAgIF1cbiAgICAgIH0sXG4gICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICB9LFxuICAgIFwiY29sbGVjdGlvbkZvcm1hdFwiOiB7XG4gICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgIFwiZW51bVwiOiBbXG4gICAgICAgIFwiY3N2XCIsXG4gICAgICAgIFwic3N2XCIsXG4gICAgICAgIFwidHN2XCIsXG4gICAgICAgIFwicGlwZXNcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcImNvbGxlY3Rpb25Gb3JtYXRXaXRoTXVsdGlcIjoge1xuICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICBcImVudW1cIjogW1xuICAgICAgICBcImNzdlwiLFxuICAgICAgICBcInNzdlwiLFxuICAgICAgICBcInRzdlwiLFxuICAgICAgICBcInBpcGVzXCIsXG4gICAgICAgIFwibXVsdGlcIlxuICAgICAgXSxcbiAgICAgIFwiZGVmYXVsdFwiOiBcImNzdlwiXG4gICAgfSxcbiAgICBcInRpdGxlXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3RpdGxlXCJcbiAgICB9LFxuICAgIFwiZGVzY3JpcHRpb25cIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvZGVzY3JpcHRpb25cIlxuICAgIH0sXG4gICAgXCJkZWZhdWx0XCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2RlZmF1bHRcIlxuICAgIH0sXG4gICAgXCJtdWx0aXBsZU9mXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL211bHRpcGxlT2ZcIlxuICAgIH0sXG4gICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21heGltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNYXhpbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1heGltdW1cIlxuICAgIH0sXG4gICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL21pbmltdW1cIlxuICAgIH0sXG4gICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2V4Y2x1c2l2ZU1pbmltdW1cIlxuICAgIH0sXG4gICAgXCJtYXhMZW5ndGhcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiXG4gICAgfSxcbiAgICBcIm1pbkxlbmd0aFwiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIlxuICAgIH0sXG4gICAgXCJwYXR0ZXJuXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL3BhdHRlcm5cIlxuICAgIH0sXG4gICAgXCJtYXhJdGVtc1wiOiB7XG4gICAgICBcIiRyZWZcIjogXCJodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA0L3NjaGVtYSMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCJcbiAgICB9LFxuICAgIFwibWluSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCJcbiAgICB9LFxuICAgIFwidW5pcXVlSXRlbXNcIjoge1xuICAgICAgXCIkcmVmXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjL3Byb3BlcnRpZXMvdW5pcXVlSXRlbXNcIlxuICAgIH0sXG4gICAgXCJlbnVtXCI6IHtcbiAgICAgIFwiJHJlZlwiOiBcImh0dHA6Ly9qc29uLXNjaGVtYS5vcmcvZHJhZnQtMDQvc2NoZW1hIy9wcm9wZXJ0aWVzL2VudW1cIlxuICAgIH0sXG4gICAgXCJqc29uUmVmZXJlbmNlXCI6IHtcbiAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgXCJyZXF1aXJlZFwiOiBbXG4gICAgICAgIFwiJHJlZlwiXG4gICAgICBdLFxuICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiBmYWxzZSxcbiAgICAgIFwicHJvcGVydGllc1wiOiB7XG4gICAgICAgIFwiJHJlZlwiOiB7XG4gICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufSIsIm1vZHVsZS5leHBvcnRzPXtcbiAgICBcImlkXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCIkc2NoZW1hXCI6IFwiaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNC9zY2hlbWEjXCIsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBcIkNvcmUgc2NoZW1hIG1ldGEtc2NoZW1hXCIsXG4gICAgXCJkZWZpbml0aW9uc1wiOiB7XG4gICAgICAgIFwic2NoZW1hQXJyYXlcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwiYXJyYXlcIixcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwiaXRlbXNcIjogeyBcIiRyZWZcIjogXCIjXCIgfVxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlclwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJpbnRlZ2VyXCIsXG4gICAgICAgICAgICBcIm1pbmltdW1cIjogMFxuICAgICAgICB9LFxuICAgICAgICBcInBvc2l0aXZlSW50ZWdlckRlZmF1bHQwXCI6IHtcbiAgICAgICAgICAgIFwiYWxsT2ZcIjogWyB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSwgeyBcImRlZmF1bHRcIjogMCB9IF1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzaW1wbGVUeXBlc1wiOiB7XG4gICAgICAgICAgICBcImVudW1cIjogWyBcImFycmF5XCIsIFwiYm9vbGVhblwiLCBcImludGVnZXJcIiwgXCJudWxsXCIsIFwibnVtYmVyXCIsIFwib2JqZWN0XCIsIFwic3RyaW5nXCIgXVxuICAgICAgICB9LFxuICAgICAgICBcInN0cmluZ0FycmF5XCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCJ0eXBlXCI6IFwic3RyaW5nXCIgfSxcbiAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgIFwidW5pcXVlSXRlbXNcIjogdHJ1ZVxuICAgICAgICB9XG4gICAgfSxcbiAgICBcInR5cGVcIjogXCJvYmplY3RcIixcbiAgICBcInByb3BlcnRpZXNcIjoge1xuICAgICAgICBcImlkXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcInN0cmluZ1wiLFxuICAgICAgICAgICAgXCJmb3JtYXRcIjogXCJ1cmlcIlxuICAgICAgICB9LFxuICAgICAgICBcIiRzY2hlbWFcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCIsXG4gICAgICAgICAgICBcImZvcm1hdFwiOiBcInVyaVwiXG4gICAgICAgIH0sXG4gICAgICAgIFwidGl0bGVcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwic3RyaW5nXCJcbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXNjcmlwdGlvblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIlxuICAgICAgICB9LFxuICAgICAgICBcImRlZmF1bHRcIjoge30sXG4gICAgICAgIFwibXVsdGlwbGVPZlwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJudW1iZXJcIixcbiAgICAgICAgICAgIFwibWluaW11bVwiOiAwLFxuICAgICAgICAgICAgXCJleGNsdXNpdmVNaW5pbXVtXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhpbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtaW5pbXVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm51bWJlclwiXG4gICAgICAgIH0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJib29sZWFuXCIsXG4gICAgICAgICAgICBcImRlZmF1bHRcIjogZmFsc2VcbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhMZW5ndGhcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluTGVuZ3RoXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9wb3NpdGl2ZUludGVnZXJEZWZhdWx0MFwiIH0sXG4gICAgICAgIFwicGF0dGVyblwiOiB7XG4gICAgICAgICAgICBcInR5cGVcIjogXCJzdHJpbmdcIixcbiAgICAgICAgICAgIFwiZm9ybWF0XCI6IFwicmVnZXhcIlxuICAgICAgICB9LFxuICAgICAgICBcImFkZGl0aW9uYWxJdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwidHlwZVwiOiBcImJvb2xlYW5cIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiI1wiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJpdGVtc1wiOiB7XG4gICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH1cbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYXhJdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyXCIgfSxcbiAgICAgICAgXCJtaW5JdGVtc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImJvb2xlYW5cIixcbiAgICAgICAgICAgIFwiZGVmYXVsdFwiOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBcIm1heFByb3BlcnRpZXNcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3Bvc2l0aXZlSW50ZWdlclwiIH0sXG4gICAgICAgIFwibWluUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvcG9zaXRpdmVJbnRlZ2VyRGVmYXVsdDBcIiB9LFxuICAgICAgICBcInJlcXVpcmVkXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zdHJpbmdBcnJheVwiIH0sXG4gICAgICAgIFwiYWRkaXRpb25hbFByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJhbnlPZlwiOiBbXG4gICAgICAgICAgICAgICAgeyBcInR5cGVcIjogXCJib29sZWFuXCIgfSxcbiAgICAgICAgICAgICAgICB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGVmaW5pdGlvbnNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJwcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcIm9iamVjdFwiLFxuICAgICAgICAgICAgXCJhZGRpdGlvbmFsUHJvcGVydGllc1wiOiB7IFwiJHJlZlwiOiBcIiNcIiB9LFxuICAgICAgICAgICAgXCJkZWZhdWx0XCI6IHt9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGF0dGVyblByb3BlcnRpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHsgXCIkcmVmXCI6IFwiI1wiIH0sXG4gICAgICAgICAgICBcImRlZmF1bHRcIjoge31cbiAgICAgICAgfSxcbiAgICAgICAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgICAgICAgICAgXCJ0eXBlXCI6IFwib2JqZWN0XCIsXG4gICAgICAgICAgICBcImFkZGl0aW9uYWxQcm9wZXJ0aWVzXCI6IHtcbiAgICAgICAgICAgICAgICBcImFueU9mXCI6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjXCIgfSxcbiAgICAgICAgICAgICAgICAgICAgeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5XCIgfVxuICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJlbnVtXCI6IHtcbiAgICAgICAgICAgIFwidHlwZVwiOiBcImFycmF5XCIsXG4gICAgICAgICAgICBcIm1pbkl0ZW1zXCI6IDEsXG4gICAgICAgICAgICBcInVuaXF1ZUl0ZW1zXCI6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgXCJ0eXBlXCI6IHtcbiAgICAgICAgICAgIFwiYW55T2ZcIjogW1xuICAgICAgICAgICAgICAgIHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBcInR5cGVcIjogXCJhcnJheVwiLFxuICAgICAgICAgICAgICAgICAgICBcIml0ZW1zXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlc1wiIH0sXG4gICAgICAgICAgICAgICAgICAgIFwibWluSXRlbXNcIjogMSxcbiAgICAgICAgICAgICAgICAgICAgXCJ1bmlxdWVJdGVtc1wiOiB0cnVlXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9LFxuICAgICAgICBcImFsbE9mXCI6IHsgXCIkcmVmXCI6IFwiIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheVwiIH0sXG4gICAgICAgIFwiYW55T2ZcIjogeyBcIiRyZWZcIjogXCIjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5XCIgfSxcbiAgICAgICAgXCJvbmVPZlwiOiB7IFwiJHJlZlwiOiBcIiMvZGVmaW5pdGlvbnMvc2NoZW1hQXJyYXlcIiB9LFxuICAgICAgICBcIm5vdFwiOiB7IFwiJHJlZlwiOiBcIiNcIiB9XG4gICAgfSxcbiAgICBcImRlcGVuZGVuY2llc1wiOiB7XG4gICAgICAgIFwiZXhjbHVzaXZlTWF4aW11bVwiOiBbIFwibWF4aW11bVwiIF0sXG4gICAgICAgIFwiZXhjbHVzaXZlTWluaW11bVwiOiBbIFwibWluaW11bVwiIF1cbiAgICB9LFxuICAgIFwiZGVmYXVsdFwiOiB7fVxufVxuIl19
