"use strict";
// See: https://github.com/ethereum/wiki/wiki/Ethereum-Contract-ABI
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultAbiCoder = exports.getBuiltinCallException = exports.AbiCoder = void 0;
const index_js_1 = require("../utils/index.js");
const abstract_coder_js_1 = require("./coders/abstract-coder.js");
const address_js_1 = require("./coders/address.js");
const array_js_1 = require("./coders/array.js");
const boolean_js_1 = require("./coders/boolean.js");
const bytes_js_1 = require("./coders/bytes.js");
const fixed_bytes_js_1 = require("./coders/fixed-bytes.js");
const null_js_1 = require("./coders/null.js");
const number_js_1 = require("./coders/number.js");
const string_js_1 = require("./coders/string.js");
const tuple_js_1 = require("./coders/tuple.js");
const fragments_js_1 = require("./fragments.js");
const index_js_2 = require("../address/index.js");
const index_js_3 = require("../utils/index.js");
const paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
const paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);
class AbiCoder {
    #getCoder(param) {
        if (param.isArray()) {
            return new array_js_1.ArrayCoder(this.#getCoder(param.arrayChildren), param.arrayLength, param.name);
        }
        if (param.isTuple()) {
            return new tuple_js_1.TupleCoder(param.components.map((c) => this.#getCoder(c)), param.name);
        }
        switch (param.baseType) {
            case "address":
                return new address_js_1.AddressCoder(param.name);
            case "bool":
                return new boolean_js_1.BooleanCoder(param.name);
            case "string":
                return new string_js_1.StringCoder(param.name);
            case "bytes":
                return new bytes_js_1.BytesCoder(param.name);
            case "":
                return new null_js_1.NullCoder(param.name);
        }
        // u?int[0-9]*
        let match = param.type.match(paramTypeNumber);
        if (match) {
            let size = parseInt(match[2] || "256");
            if (size === 0 || size > 256 || (size % 8) !== 0) {
                (0, index_js_1.throwArgumentError)("invalid " + match[1] + " bit length", "param", param);
            }
            return new number_js_1.NumberCoder(size / 8, (match[1] === "int"), param.name);
        }
        // bytes[0-9]+
        match = param.type.match(paramTypeBytes);
        if (match) {
            let size = parseInt(match[1]);
            if (size === 0 || size > 32) {
                (0, index_js_1.throwArgumentError)("invalid bytes length", "param", param);
            }
            return new fixed_bytes_js_1.FixedBytesCoder(size, param.name);
        }
        return (0, index_js_1.throwArgumentError)("invalid type", "type", param.type);
    }
    getDefaultValue(types) {
        const coders = types.map((type) => this.#getCoder(fragments_js_1.ParamType.from(type)));
        const coder = new tuple_js_1.TupleCoder(coders, "_");
        return coder.defaultValue();
    }
    encode(types, values) {
        (0, index_js_1.assertArgumentCount)(values.length, types.length, "types/values length mismatch");
        const coders = types.map((type) => this.#getCoder(fragments_js_1.ParamType.from(type)));
        const coder = (new tuple_js_1.TupleCoder(coders, "_"));
        const writer = new abstract_coder_js_1.Writer();
        coder.encode(writer, values);
        return writer.data;
    }
    decode(types, data, loose) {
        const coders = types.map((type) => this.#getCoder(fragments_js_1.ParamType.from(type)));
        const coder = new tuple_js_1.TupleCoder(coders, "_");
        return coder.decode(new abstract_coder_js_1.Reader(data, loose));
    }
}
exports.AbiCoder = AbiCoder;
// https://docs.soliditylang.org/en/v0.8.17/control-structures.html
const PanicReasons = new Map();
PanicReasons.set(0x00, "GENERIC_PANIC");
PanicReasons.set(0x01, "ASSERT_FALSE");
PanicReasons.set(0x11, "OVERFLOW");
PanicReasons.set(0x12, "DIVIDE_BY_ZERO");
PanicReasons.set(0x21, "ENUM_RANGE_ERROR");
PanicReasons.set(0x22, "BAD_STORAGE_DATA");
PanicReasons.set(0x31, "STACK_UNDERFLOW");
PanicReasons.set(0x32, "ARRAY_RANGE_ERROR");
PanicReasons.set(0x41, "OUT_OF_MEMORY");
PanicReasons.set(0x51, "UNINITIALIZED_FUNCTION_CALL");
function getBuiltinCallException(action, tx, data) {
    let message = "missing revert data";
    let reason = null;
    const invocation = null;
    let revert = null;
    if (data) {
        message = "execution reverted";
        const bytes = (0, index_js_3.getBytes)(data);
        data = (0, index_js_3.hexlify)(data);
        if (bytes.length % 32 !== 4) {
            message += " (could not decode reason; invalid data length)";
        }
        else if ((0, index_js_3.hexlify)(bytes.slice(0, 4)) === "0x08c379a0") {
            // Error(string)
            try {
                reason = exports.defaultAbiCoder.decode(["string"], bytes.slice(4))[0];
                revert = {
                    signature: "Error(string)",
                    name: "Error",
                    args: [reason]
                };
                message += `: ${JSON.stringify(reason)}`;
            }
            catch (error) {
                console.log(error);
                message += " (could not decode reason; invalid data)";
            }
        }
        else if ((0, index_js_3.hexlify)(bytes.slice(0, 4)) === "0x4e487b71") {
            // Panic(uint256)
            try {
                const code = Number(exports.defaultAbiCoder.decode(["uint256"], bytes.slice(4))[0]);
                revert = {
                    signature: "Panic(uint256)",
                    name: "Panic",
                    args: [code]
                };
                reason = `Panic due to ${PanicReasons.get(code) || "UNKNOWN"}(${code})`;
                message += `: ${reason}`;
            }
            catch (error) {
                console.log(error);
                message += " (could not decode panic reason)";
            }
        }
        else {
            message += " (unknown custom error)";
        }
    }
    const transaction = {
        to: (tx.to ? (0, index_js_2.getAddress)(tx.to) : null),
        data: (tx.data || "0x")
    };
    if (tx.from) {
        transaction.from = (0, index_js_2.getAddress)(tx.from);
    }
    return (0, index_js_3.makeError)(message, "CALL_EXCEPTION", {
        action, data, reason, transaction, invocation, revert
    });
}
exports.getBuiltinCallException = getBuiltinCallException;
exports.defaultAbiCoder = new AbiCoder();
//# sourceMappingURL=abi-coder.js.map