import plugin from './server';
import type { ExperimentsRulesetPlugin, Ruleset } from './server.types';

describe('experimentsRuleset plugin', () => {
    it('should have correct plugin type', () => {
        expect(plugin.type).toBe('experimentsRuleset');
    });

    it('should offer no ruleset at all', () => {
        // `undefined`, not `{}`. The two are different answers: `undefined` says "ask your own
        // configuration", while `{}` says "there are deliberately no experiments right now" and is
        // honoured as given. The default has nothing to offer, so it says so.
        expect(plugin.getRuleset()).toBeUndefined();
    });

    it('should keep offering nothing on every call', () => {
        expect(plugin.getRuleset()).toBe(plugin.getRuleset());
    });

    it('should let an implementation express a deliberately empty ruleset', () => {
        // The distinction this type exists to preserve. A plugin backed by a remote source must be
        // able to publish "no experiments" — switching every experiment off at once — without that
        // being mistaken for "this plugin has no answer", which would send ILC back to its own
        // configuration and turn them all back on.
        const emptyOnPurpose: ExperimentsRulesetPlugin = {
            type: 'experimentsRuleset',
            getRuleset: () => ({}),
        };

        expect(emptyOnPurpose.getRuleset()).toEqual({});
        expect(emptyOnPurpose.getRuleset()).not.toBeUndefined();
    });

    it('should be assignable to a ruleset source that returns the SDK ruleset type', () => {
        // Compile-time check of the plugin's own contract: the plugin object is usable wherever a
        // "something that returns a Ruleset synchronously, or nothing" is expected, with no adapter.
        const source: { getRuleset(): Ruleset | undefined } = plugin;

        expect(source.getRuleset()).toBeUndefined();
    });
});
