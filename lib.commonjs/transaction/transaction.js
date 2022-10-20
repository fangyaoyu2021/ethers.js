"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Transaction = void 0;
const index_js_1 = require("../address/index.js");
const index_js_2 = require("../crypto/index.js");
const index_js_3 = require("../utils/index.js");
const accesslist_js_1 = require("./accesslist.js");
const address_js_1 = require("./address.js");
const BN_0 = BigInt(0);
const BN_2 = BigInt(2);
const BN_27 = BigInt(27);
const BN_28 = BigInt(28);
const BN_35 = BigInt(35);
const BN_MAX_UINT = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
function handleAddress(value) {
    if (value === "0x") {
        return null;
    }
    return (0, index_js_1.getAddress)(value);
}
function handleData(value, param) {
    try {
        return (0, index_js_3.hexlify)(value);
    }
    catch (error) {
        return (0, index_js_3.throwArgumentError)("invalid data", param, value);
    }
}
function handleAccessList(value, param) {
    try {
        return (0, accesslist_js_1.accessListify)(value);
    }
    catch (error) {
        return (0, index_js_3.throwArgumentError)("invalid accessList", param, value);
    }
}
function handleNumber(_value, param) {
    if (_value === "0x") {
        return 0;
    }
    return (0, index_js_3.getNumber)(_value, param);
}
function handleUint(_value, param) {
    if (_value === "0x") {
        return BN_0;
    }
    const value = (0, index_js_3.getBigInt)(_value, param);
    if (value > BN_MAX_UINT) {
        (0, index_js_3.throwArgumentError)("value exceeds uint size", param, value);
    }
    return value;
}
function formatNumber(_value, name) {
    const value = (0, index_js_3.getBigInt)(_value, "value");
    const result = (0, index_js_3.toArray)(value);
    if (result.length > 32) {
        (0, index_js_3.throwArgumentError)(`value too large`, `tx.${name}`, value);
    }
    return result;
}
function formatAccessList(value) {
    return (0, accesslist_js_1.accessListify)(value).map((set) => [set.address, set.storageKeys]);
}
function _parseLegacy(data) {
    const fields = (0, index_js_3.decodeRlp)(data);
    if (!Array.isArray(fields) || (fields.length !== 9 && fields.length !== 6)) {
        return (0, index_js_3.throwArgumentError)("invalid field count for legacy transaction", "data", data);
    }
    const tx = {
        type: 0,
        nonce: handleNumber(fields[0], "nonce"),
        gasPrice: handleUint(fields[1], "gasPrice"),
        gasLimit: handleUint(fields[2], "gasLimit"),
        to: handleAddress(fields[3]),
        value: handleUint(fields[4], "value"),
        data: handleData(fields[5], "dta"),
        chainId: BN_0
    };
    // Legacy unsigned transaction
    if (fields.length === 6) {
        return tx;
    }
    const v = handleUint(fields[6], "v");
    const r = handleUint(fields[7], "r");
    const s = handleUint(fields[8], "s");
    if (r === BN_0 && s === BN_0) {
        // EIP-155 unsigned transaction
        tx.chainId = v;
    }
    else {
        // Compute the EIP-155 chain ID (or 0 for legacy)
        let chainId = (v - BN_35) / BN_2;
        if (chainId < BN_0) {
            chainId = BN_0;
        }
        tx.chainId = chainId;
        // Signed Legacy Transaction
        if (chainId === BN_0 && (v < BN_27 || v > BN_28)) {
            (0, index_js_3.throwArgumentError)("non-canonical legacy v", "v", fields[6]);
        }
        tx.signature = index_js_2.Signature.from({
            r: (0, index_js_3.zeroPadValue)(fields[7], 32),
            s: (0, index_js_3.zeroPadValue)(fields[8], 32),
            v
        });
        tx.hash = (0, index_js_2.keccak256)(data);
    }
    return tx;
}
function _serializeLegacy(tx, sig) {
    const fields = [
        formatNumber(tx.nonce || 0, "nonce"),
        formatNumber(tx.gasPrice || 0, "gasPrice"),
        formatNumber(tx.gasLimit || 0, "gasLimit"),
        ((tx.to != null) ? (0, index_js_1.getAddress)(tx.to) : "0x"),
        formatNumber(tx.value || 0, "value"),
        (tx.data || "0x"),
    ];
    let chainId = BN_0;
    if (tx.chainId != null) {
        // A chainId was provided; if non-zero we'll use EIP-155
        chainId = (0, index_js_3.getBigInt)(tx.chainId, "tx.chainId");
        // We have a chainId in the tx and an EIP-155 v in the signature,
        // make sure they agree with each other
        if (sig && sig.networkV != null && sig.legacyChainId !== chainId) {
            (0, index_js_3.throwArgumentError)("tx.chainId/sig.v mismatch", "sig", sig);
        }
    }
    else if (sig) {
        // No chainId provided, but the signature is signing with EIP-155; derive chainId
        const legacy = sig.legacyChainId;
        if (legacy != null) {
            chainId = legacy;
        }
    }
    // Requesting an unsigned transaction
    if (!sig) {
        // We have an EIP-155 transaction (chainId was specified and non-zero)
        if (chainId !== BN_0) {
            fields.push((0, index_js_3.toArray)(chainId));
            fields.push("0x");
            fields.push("0x");
        }
        return (0, index_js_3.encodeRlp)(fields);
    }
    // We pushed a chainId and null r, s on for hashing only; remove those
    let v = BigInt(27 + sig.yParity);
    if (chainId !== BN_0) {
        v = index_js_2.Signature.getChainIdV(chainId, sig.v);
    }
    else if (BigInt(sig.v) !== v) {
        (0, index_js_3.throwArgumentError)("tx.chainId/sig.v mismatch", "sig", sig);
    }
    fields.push((0, index_js_3.toArray)(v));
    fields.push((0, index_js_3.toArray)(sig.r));
    fields.push((0, index_js_3.toArray)(sig.s));
    return (0, index_js_3.encodeRlp)(fields);
}
function _parseEipSignature(tx, fields, serialize) {
    let yParity;
    try {
        yParity = handleNumber(fields[0], "yParity");
        if (yParity !== 0 && yParity !== 1) {
            throw new Error("bad yParity");
        }
    }
    catch (error) {
        return (0, index_js_3.throwArgumentError)("invalid yParity", "yParity", fields[0]);
    }
    const r = (0, index_js_3.zeroPadValue)(fields[1], 32);
    const s = (0, index_js_3.zeroPadValue)(fields[2], 32);
    const signature = index_js_2.Signature.from({ r, s, yParity });
    tx.signature = signature;
}
function _parseEip1559(data) {
    const fields = (0, index_js_3.decodeRlp)((0, index_js_3.getBytes)(data).slice(1));
    if (!Array.isArray(fields) || (fields.length !== 9 && fields.length !== 12)) {
        (0, index_js_3.throwArgumentError)("invalid field count for transaction type: 2", "data", (0, index_js_3.hexlify)(data));
    }
    const maxPriorityFeePerGas = handleUint(fields[2], "maxPriorityFeePerGas");
    const maxFeePerGas = handleUint(fields[3], "maxFeePerGas");
    const tx = {
        type: 2,
        chainId: handleUint(fields[0], "chainId"),
        nonce: handleNumber(fields[1], "nonce"),
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
        gasPrice: null,
        gasLimit: handleUint(fields[4], "gasLimit"),
        to: handleAddress(fields[5]),
        value: handleUint(fields[6], "value"),
        data: handleData(fields[7], "data"),
        accessList: handleAccessList(fields[8], "accessList"),
    };
    // Unsigned EIP-1559 Transaction
    if (fields.length === 9) {
        return tx;
    }
    tx.hash = (0, index_js_2.keccak256)(data);
    _parseEipSignature(tx, fields.slice(9), _serializeEip1559);
    return tx;
}
function _serializeEip1559(tx, sig) {
    const fields = [
        formatNumber(tx.chainId || 0, "chainId"),
        formatNumber(tx.nonce || 0, "nonce"),
        formatNumber(tx.maxPriorityFeePerGas || 0, "maxPriorityFeePerGas"),
        formatNumber(tx.maxFeePerGas || 0, "maxFeePerGas"),
        formatNumber(tx.gasLimit || 0, "gasLimit"),
        ((tx.to != null) ? (0, index_js_1.getAddress)(tx.to) : "0x"),
        formatNumber(tx.value || 0, "value"),
        (tx.data || "0x"),
        (formatAccessList(tx.accessList || []))
    ];
    if (sig) {
        fields.push(formatNumber(sig.yParity, "yParity"));
        fields.push((0, index_js_3.toArray)(sig.r));
        fields.push((0, index_js_3.toArray)(sig.s));
    }
    return (0, index_js_3.concat)(["0x02", (0, index_js_3.encodeRlp)(fields)]);
}
function _parseEip2930(data) {
    const fields = (0, index_js_3.decodeRlp)((0, index_js_3.getBytes)(data).slice(1));
    if (!Array.isArray(fields) || (fields.length !== 8 && fields.length !== 11)) {
        (0, index_js_3.throwArgumentError)("invalid field count for transaction type: 1", "data", (0, index_js_3.hexlify)(data));
    }
    const tx = {
        type: 1,
        chainId: handleUint(fields[0], "chainId"),
        nonce: handleNumber(fields[1], "nonce"),
        gasPrice: handleUint(fields[2], "gasPrice"),
        gasLimit: handleUint(fields[3], "gasLimit"),
        to: handleAddress(fields[4]),
        value: handleUint(fields[5], "value"),
        data: handleData(fields[6], "data"),
        accessList: handleAccessList(fields[7], "accessList")
    };
    // Unsigned EIP-2930 Transaction
    if (fields.length === 8) {
        return tx;
    }
    tx.hash = (0, index_js_2.keccak256)(data);
    _parseEipSignature(tx, fields.slice(8), _serializeEip2930);
    return tx;
}
function _serializeEip2930(tx, sig) {
    const fields = [
        formatNumber(tx.chainId || 0, "chainId"),
        formatNumber(tx.nonce || 0, "nonce"),
        formatNumber(tx.gasPrice || 0, "gasPrice"),
        formatNumber(tx.gasLimit || 0, "gasLimit"),
        ((tx.to != null) ? (0, index_js_1.getAddress)(tx.to) : "0x"),
        formatNumber(tx.value || 0, "value"),
        (tx.data || "0x"),
        (formatAccessList(tx.accessList || []))
    ];
    if (sig) {
        fields.push(formatNumber(sig.yParity, "recoveryParam"));
        fields.push((0, index_js_3.toArray)(sig.r));
        fields.push((0, index_js_3.toArray)(sig.s));
    }
    return (0, index_js_3.concat)(["0x01", (0, index_js_3.encodeRlp)(fields)]);
}
class Transaction {
    #props;
    // A type of null indicates the type will be populated automatically
    get type() { return (0, index_js_3.getStore)(this.#props, "type"); }
    get typeName() {
        switch (this.type) {
            case 0: return "legacy";
            case 1: return "eip-2930";
            case 2: return "eip-1559";
        }
        return null;
    }
    set type(value) {
        switch (value) {
            case null:
                (0, index_js_3.setStore)(this.#props, "type", null);
                break;
            case 0:
            case "legacy":
                (0, index_js_3.setStore)(this.#props, "type", 0);
                break;
            case 1:
            case "berlin":
            case "eip-2930":
                (0, index_js_3.setStore)(this.#props, "type", 1);
                break;
            case 2:
            case "london":
            case "eip-1559":
                (0, index_js_3.setStore)(this.#props, "type", 2);
                break;
            default:
                throw new Error(`unsupported transaction type`);
        }
    }
    get to() { return (0, index_js_3.getStore)(this.#props, "to"); }
    set to(value) {
        (0, index_js_3.setStore)(this.#props, "to", (value == null) ? null : (0, index_js_1.getAddress)(value));
    }
    get nonce() { return (0, index_js_3.getStore)(this.#props, "nonce"); }
    set nonce(value) { (0, index_js_3.setStore)(this.#props, "nonce", (0, index_js_3.getNumber)(value, "value")); }
    get gasLimit() { return (0, index_js_3.getStore)(this.#props, "gasLimit"); }
    set gasLimit(value) { (0, index_js_3.setStore)(this.#props, "gasLimit", (0, index_js_3.getBigInt)(value)); }
    get gasPrice() {
        const value = (0, index_js_3.getStore)(this.#props, "gasPrice");
        if (value == null && (this.type === 0 || this.type === 1)) {
            return BN_0;
        }
        return value;
    }
    set gasPrice(value) {
        (0, index_js_3.setStore)(this.#props, "gasPrice", (value == null) ? null : (0, index_js_3.getBigInt)(value, "gasPrice"));
    }
    get maxPriorityFeePerGas() {
        const value = (0, index_js_3.getStore)(this.#props, "maxPriorityFeePerGas");
        if (value == null && this.type === 2) {
            return BN_0;
        }
        return value;
    }
    set maxPriorityFeePerGas(value) {
        (0, index_js_3.setStore)(this.#props, "maxPriorityFeePerGas", (value == null) ? null : (0, index_js_3.getBigInt)(value, "maxPriorityFeePerGas"));
    }
    get maxFeePerGas() {
        const value = (0, index_js_3.getStore)(this.#props, "maxFeePerGas");
        if (value == null && this.type === 2) {
            return BN_0;
        }
        return value;
    }
    set maxFeePerGas(value) {
        (0, index_js_3.setStore)(this.#props, "maxFeePerGas", (value == null) ? null : (0, index_js_3.getBigInt)(value, "maxFeePerGas"));
    }
    get data() { return (0, index_js_3.getStore)(this.#props, "data"); }
    set data(value) { (0, index_js_3.setStore)(this.#props, "data", (0, index_js_3.hexlify)(value)); }
    get value() { return (0, index_js_3.getStore)(this.#props, "value"); }
    set value(value) {
        (0, index_js_3.setStore)(this.#props, "value", (0, index_js_3.getBigInt)(value, "value"));
    }
    get chainId() { return (0, index_js_3.getStore)(this.#props, "chainId"); }
    set chainId(value) { (0, index_js_3.setStore)(this.#props, "chainId", (0, index_js_3.getBigInt)(value)); }
    get signature() { return (0, index_js_3.getStore)(this.#props, "sig") || null; }
    set signature(value) {
        (0, index_js_3.setStore)(this.#props, "sig", (value == null) ? null : index_js_2.Signature.from(value));
    }
    get accessList() {
        const value = (0, index_js_3.getStore)(this.#props, "accessList") || null;
        if (value == null && (this.type === 1 || this.type === 2)) {
            return [];
        }
        return value;
    }
    set accessList(value) {
        (0, index_js_3.setStore)(this.#props, "accessList", (value == null) ? null : (0, accesslist_js_1.accessListify)(value));
    }
    constructor() {
        this.#props = {
            type: null,
            to: null,
            nonce: 0,
            gasLimit: BigInt(0),
            gasPrice: null,
            maxPriorityFeePerGas: null,
            maxFeePerGas: null,
            data: "0x",
            value: BigInt(0),
            chainId: BigInt(0),
            sig: null,
            accessList: null
        };
    }
    get hash() {
        if (this.signature == null) {
            return null;
        }
        return (0, index_js_2.keccak256)(this.serialized);
    }
    get unsignedHash() {
        return (0, index_js_2.keccak256)(this.unsignedSerialized);
    }
    get from() {
        if (this.signature == null) {
            return null;
        }
        return (0, address_js_1.recoverAddress)(this.unsignedHash, this.signature);
    }
    get fromPublicKey() {
        if (this.signature == null) {
            return null;
        }
        throw new Error("@TODO");
        // use ecrecover
        return "";
    }
    isSigned() {
        return this.signature != null;
    }
    get serialized() {
        if (this.signature == null) {
            throw new Error("cannot serialize unsigned transaction; maybe you meant .unsignedSerialized");
        }
        const types = this.inferTypes();
        if (types.length !== 1) {
            throw new Error("cannot determine transaction type; specify type manually");
        }
        switch (types[0]) {
            case 0:
                return _serializeLegacy(this, this.signature);
            case 1:
                return _serializeEip2930(this, this.signature);
            case 2:
                return _serializeEip1559(this, this.signature);
        }
        throw new Error("unsupported type");
    }
    get unsignedSerialized() {
        const types = this.inferTypes();
        if (types.length !== 1) {
            throw new Error("cannot determine transaction type; specify type manually");
        }
        switch (types[0]) {
            case 0:
                return _serializeLegacy(this);
            case 1:
                return _serializeEip2930(this);
            case 2:
                return _serializeEip1559(this);
        }
        throw new Error("unsupported type");
    }
    // Validates properties and lists possible types this transaction adheres to
    inferTypes() {
        // Checks that there are no conflicting properties set
        const hasGasPrice = this.gasPrice != null;
        const hasFee = (this.maxFeePerGas != null || this.maxPriorityFeePerGas != null);
        const hasAccessList = (this.accessList != null);
        //if (hasGasPrice && hasFee) {
        //    throw new Error("transaction cannot have gasPrice and maxFeePerGas");
        //}
        if (this.maxFeePerGas != null && this.maxPriorityFeePerGas != null) {
            if (this.maxFeePerGas < this.maxPriorityFeePerGas) {
                throw new Error("priorityFee cannot be more than maxFee");
            }
        }
        //if (this.type === 2 && hasGasPrice) {
        //    throw new Error("eip-1559 transaction cannot have gasPrice");
        //}
        if ((this.type === 0 || this.type === 1) && hasFee) {
            throw new Error("transaction type cannot have maxFeePerGas or maxPriorityFeePerGas");
        }
        if (this.type === 0 && hasAccessList) {
            throw new Error("legacy transaction cannot have accessList");
        }
        const types = [];
        // Explicit type
        if (this.type != null) {
            types.push(this.type);
        }
        else {
            if (hasFee) {
                types.push(2);
            }
            else if (hasGasPrice) {
                types.push(1);
                if (!hasAccessList) {
                    types.push(0);
                }
            }
            else if (hasAccessList) {
                types.push(1);
                types.push(2);
            }
            else {
                types.push(0);
                types.push(1);
                types.push(2);
            }
        }
        types.sort();
        return types;
    }
    isLegacy() {
        return (this.type === 0);
    }
    isBerlin() {
        return (this.type === 1);
    }
    isLondon() {
        return (this.type === 2);
    }
    clone() {
        return Transaction.from(this);
    }
    freeze() {
        if (this.#props.sig) {
            this.#props.sig = (this.#props.sig.clone().freeze());
        }
        if (this.#props.accessList) {
            this.#props.accessList = Object.freeze(this.#props.accessList.map((set) => {
                Object.freeze(set.storageKeys);
                return Object.freeze(set);
            }));
        }
        Object.freeze(this.#props);
        return this;
    }
    isFrozen() {
        return Object.isFrozen(this.#props);
    }
    toJSON() {
        const s = (v) => {
            if (v == null) {
                return null;
            }
            return v.toString();
        };
        return {
            type: this.type,
            to: this.to,
            from: this.from,
            data: this.data,
            nonce: this.nonce,
            gasLimit: s(this.gasLimit),
            gasPrice: s(this.gasPrice),
            maxPriorityFeePerGas: s(this.maxPriorityFeePerGas),
            maxFeePerGas: s(this.maxFeePerGas),
            value: s(this.value),
            chainId: s(this.chainId),
            sig: this.signature ? this.signature.toJSON() : null,
            accessList: this.accessList
        };
    }
    static from(tx) {
        if (typeof (tx) === "string") {
            const payload = (0, index_js_3.getBytes)(tx);
            if (payload[0] >= 0x7f) { // @TODO: > vs >= ??
                return Transaction.from(_parseLegacy(payload));
            }
            switch (payload[0]) {
                case 1: return Transaction.from(_parseEip2930(payload));
                case 2: return Transaction.from(_parseEip1559(payload));
            }
            throw new Error("unsupported transaction type");
        }
        const result = new Transaction();
        if (tx.type != null) {
            result.type = tx.type;
        }
        if (tx.to != null) {
            result.to = tx.to;
        }
        if (tx.nonce != null) {
            result.nonce = tx.nonce;
        }
        if (tx.gasLimit != null) {
            result.gasLimit = tx.gasLimit;
        }
        if (tx.gasPrice != null) {
            result.gasPrice = tx.gasPrice;
        }
        if (tx.maxPriorityFeePerGas != null) {
            result.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
        }
        if (tx.maxFeePerGas != null) {
            result.maxFeePerGas = tx.maxFeePerGas;
        }
        if (tx.data != null) {
            result.data = tx.data;
        }
        if (tx.value != null) {
            result.value = tx.value;
        }
        if (tx.chainId != null) {
            result.chainId = tx.chainId;
        }
        if (tx.signature != null) {
            result.signature = index_js_2.Signature.from(tx.signature);
        }
        if (tx.accessList != null) {
            result.accessList = tx.accessList;
        }
        if (tx.hash != null) {
            if (result.isSigned()) {
                if (result.hash !== tx.hash) {
                    throw new Error("hash mismatch");
                }
            }
            else {
                throw new Error("unsigned transaction cannot have a hashs");
            }
        }
        if (tx.from != null) {
            if (result.isSigned()) {
                if (result.from.toLowerCase() !== (tx.from || "").toLowerCase()) {
                    throw new Error("from mismatch");
                }
            }
            else {
                throw new Error("unsigned transaction cannot have a from");
            }
        }
        return result;
    }
}
exports.Transaction = Transaction;
//# sourceMappingURL=transaction.js.map