const {
    getCurrentOpenTrade,
    serializeTradeForResponse,
    closeMonitorTradeFromBrokerTrade,
    upsertMonitorTradeFromBrokerTrade,
    syncWatchesWithTradeState,
} = require('./trades');
const {
    getCurrentOpenBrokerTrade,
    getSortedBrokerTrades,
    serializeBrokerTradeForResponse,
} = require('./brokerTrades');

function buildIssue({
    code,
    severity = 'warn',
    message,
    symbol = null,
    monitorTradeId = null,
    brokerTradeId = null,
    autoFixable = false,
}) {
    return {
        code,
        severity,
        message,
        symbol,
        monitorTradeId,
        brokerTradeId,
        autoFixable,
    };
}

function buildAction({
    type,
    description,
    autoApplicable = false,
    monitorTradeId = null,
    brokerTradeId = null,
    symbol = null,
}) {
    return {
        type,
        description,
        autoApplicable,
        monitorTradeId,
        brokerTradeId,
        symbol,
    };
}

function persistWatchProjection() {
    return syncWatchesWithTradeState();
}

function getMonitorConsistencySnapshot() {
    const openMonitorTrade = getCurrentOpenTrade();
    const openBrokerTrade = getCurrentOpenBrokerTrade();
    const brokerTrades = getSortedBrokerTrades();
    const issues = [];
    const proposedActions = [];

    if (!openMonitorTrade && !openBrokerTrade) {
        return {
            fetchedAt: new Date().toISOString(),
            openMonitorTrade: null,
            openBrokerTrade: null,
            issues,
            proposedActions,
        };
    }

    if (openMonitorTrade) {
        const closedBrokerMatchById = openMonitorTrade.linkedBrokerTradeId
            ? brokerTrades.find((trade) => trade.id === openMonitorTrade.linkedBrokerTradeId && trade.status === 'closed')
            : null;

        if (openMonitorTrade.linkedBrokerTradeId) {
            if (openBrokerTrade && openBrokerTrade.id === openMonitorTrade.linkedBrokerTradeId) {
                // State is consistent.
            } else if (closedBrokerMatchById) {
                issues.push(buildIssue({
                    code: 'linked_monitor_trade_closed_in_broker',
                    message: `Monitor trade ${openMonitorTrade.symbol} is still open while linked broker trade is already closed.`,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    brokerTradeId: closedBrokerMatchById.id,
                    autoFixable: true,
                }));
                proposedActions.push(buildAction({
                    type: 'close_linked_monitor_trade',
                    description: `Close monitor trade ${openMonitorTrade.symbol} using linked broker exit.`,
                    autoApplicable: true,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    brokerTradeId: closedBrokerMatchById.id,
                }));
            } else {
                issues.push(buildIssue({
                    code: 'linked_monitor_trade_missing_broker_match',
                    severity: 'error',
                    message: `Monitor trade ${openMonitorTrade.symbol} references broker trade ${openMonitorTrade.linkedBrokerTradeId}, but the broker journal has no matching open/closed trade.`,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    brokerTradeId: openMonitorTrade.linkedBrokerTradeId,
                    autoFixable: false,
                }));
            }
        } else {
            const sameDayClosedBrokerMatches = brokerTrades.filter((trade) => (
                trade.status === 'closed'
                && trade.symbol === openMonitorTrade.symbol
                && trade.entryDate === openMonitorTrade.entryDate
            ));

            if (openBrokerTrade) {
                const sameDayOpenBrokerMatch = (
                    openBrokerTrade.symbol === openMonitorTrade.symbol
                    && openBrokerTrade.entryDate === openMonitorTrade.entryDate
                );

                if (sameDayOpenBrokerMatch && openMonitorTrade.source === 'auto') {
                    issues.push(buildIssue({
                        code: 'legacy_monitor_trade_missing_link',
                        message: `Monitor trade ${openMonitorTrade.symbol} is open and matches the broker's open trade, but it is missing an explicit broker link.`,
                        symbol: openMonitorTrade.symbol,
                        monitorTradeId: openMonitorTrade.id,
                        brokerTradeId: openBrokerTrade.id,
                        autoFixable: true,
                    }));
                    proposedActions.push(buildAction({
                        type: 'link_legacy_monitor_trade',
                        description: `Attach monitor trade ${openMonitorTrade.symbol} to the matching open broker trade.`,
                        autoApplicable: true,
                        symbol: openMonitorTrade.symbol,
                        monitorTradeId: openMonitorTrade.id,
                        brokerTradeId: openBrokerTrade.id,
                    }));
                } else {
                    issues.push(buildIssue({
                        code: 'monitor_broker_symbol_mismatch',
                        severity: 'error',
                        message: `Monitor trade ${openMonitorTrade.symbol} is open while broker trade ${openBrokerTrade.symbol} is open. Automatic reconcile is unsafe.`,
                        symbol: openMonitorTrade.symbol,
                        monitorTradeId: openMonitorTrade.id,
                        brokerTradeId: openBrokerTrade.id,
                        autoFixable: false,
                    }));
                }
            } else if (openMonitorTrade.source === 'auto' && sameDayClosedBrokerMatches.length === 1) {
                issues.push(buildIssue({
                    code: 'legacy_monitor_trade_can_close_from_broker_history',
                    message: `Legacy monitor trade ${openMonitorTrade.symbol} is still open even though the matching broker trade is closed.`,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    brokerTradeId: sameDayClosedBrokerMatches[0].id,
                    autoFixable: true,
                }));
                proposedActions.push(buildAction({
                    type: 'close_legacy_monitor_trade',
                    description: `Close monitor trade ${openMonitorTrade.symbol} using the broker journal's closed trade.`,
                    autoApplicable: true,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    brokerTradeId: sameDayClosedBrokerMatches[0].id,
                }));
            } else if (openMonitorTrade.source === 'auto' && sameDayClosedBrokerMatches.length > 1) {
                issues.push(buildIssue({
                    code: 'legacy_monitor_trade_ambiguous_broker_match',
                    severity: 'error',
                    message: `Monitor trade ${openMonitorTrade.symbol} has multiple matching closed broker trades for ${openMonitorTrade.entryDate}. Automatic reconcile is unsafe.`,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    autoFixable: false,
                }));
            } else {
                issues.push(buildIssue({
                    code: 'monitor_trade_without_broker_position',
                    severity: 'error',
                    message: `Monitor trade ${openMonitorTrade.symbol} is open while broker is flat. Manual monitor close is required.`,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                    autoFixable: false,
                }));
                proposedActions.push(buildAction({
                    type: 'manual_close_monitor_trade',
                    description: `Close monitor trade ${openMonitorTrade.symbol} manually from the monitoring UI.`,
                    autoApplicable: false,
                    symbol: openMonitorTrade.symbol,
                    monitorTradeId: openMonitorTrade.id,
                }));
            }
        }
    }

    if (openBrokerTrade && !openMonitorTrade && openBrokerTrade.source !== 'manual') {
        issues.push(buildIssue({
            code: 'broker_trade_without_monitor_projection',
            severity: 'warn',
            message: `Broker trade ${openBrokerTrade.symbol} is open, but monitor state is flat.`,
            symbol: openBrokerTrade.symbol,
            brokerTradeId: openBrokerTrade.id,
            autoFixable: false,
        }));
    }

    return {
        fetchedAt: new Date().toISOString(),
        openMonitorTrade: openMonitorTrade ? serializeTradeForResponse(openMonitorTrade) : null,
        openBrokerTrade: openBrokerTrade ? serializeBrokerTradeForResponse(openBrokerTrade) : null,
        issues,
        proposedActions,
    };
}

function applyConsistencyAction(action, snapshot) {
    if (!action || !snapshot) return null;

    if (action.type === 'close_linked_monitor_trade' || action.type === 'close_legacy_monitor_trade') {
        const brokerTrade = getSortedBrokerTrades().find((trade) => trade.id === action.brokerTradeId);
        if (!brokerTrade) return null;
        return closeMonitorTradeFromBrokerTrade(brokerTrade, {
            allowLegacyMatch: action.type === 'close_legacy_monitor_trade',
            note: 'reconciled_from_broker_history',
        });
    }

    if (action.type === 'link_legacy_monitor_trade') {
        const brokerTrade = getCurrentOpenBrokerTrade();
        if (!brokerTrade || brokerTrade.id !== action.brokerTradeId) return null;
        const updated = upsertMonitorTradeFromBrokerTrade(brokerTrade);
        if (updated) {
            persistWatchProjection();
        }
        return updated;
    }

    return null;
}

function reconcileMonitorState({ apply = false } = {}) {
    const before = getMonitorConsistencySnapshot();
    const appliedActions = [];

    if (apply) {
        for (const action of before.proposedActions) {
            if (!action.autoApplicable) continue;
            const result = applyConsistencyAction(action, before);
            if (result) {
                appliedActions.push({
                    ...action,
                    appliedAt: new Date().toISOString(),
                });
            }
        }
    }

    const after = getMonitorConsistencySnapshot();
    return {
        ...after,
        appliedActions,
        mode: apply ? 'apply' : 'preview',
        preview: !apply,
    };
}

function getBlockingMonitorMismatch(snapshot = null) {
    const resolved = snapshot || getMonitorConsistencySnapshot();
    const blockingIssue = resolved.issues.find((issue) => (
        issue.code === 'monitor_trade_without_broker_position'
        || issue.code === 'monitor_broker_symbol_mismatch'
        || issue.code === 'linked_monitor_trade_missing_broker_match'
        || issue.code === 'legacy_monitor_trade_ambiguous_broker_match'
    ));
    return blockingIssue || null;
}

module.exports = {
    getMonitorConsistencySnapshot,
    reconcileMonitorState,
    getBlockingMonitorMismatch,
};
