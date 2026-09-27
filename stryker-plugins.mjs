import { PluginKind, declareValuePlugin } from '@stryker-mutator/api/plugin';

// Rejection messages are for people; tests pin rejection codes instead. Mutating the wording of
// a message passed to check(), reject() or requireText() is noise in the mutation score.
const MESSAGE_ARG = { check: 2, reject: 1, requireText: 2 };

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, 'rejection-messages', {
    shouldIgnore(path) {
      if (!path.isStringLiteral() && !path.isTemplateLiteral()) return undefined;
      const call = path.parentPath;
      if (!call?.isCallExpression() || call.node.callee.type !== 'Identifier') return undefined;
      const index = MESSAGE_ARG[call.node.callee.name];
      return index !== undefined && call.node.arguments[index] === path.node
        ? 'Rejection message wording; tests assert rejection codes.'
        : undefined;
    },
  }),
];
