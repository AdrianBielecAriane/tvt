#!/bin/bash

# Ensure exactly one argument is passed
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 {LOCAL|TESTNET|MAINNET}"
    exit 1
fi

# Validate argument
case "$1" in
    LOCAL|TESTNET|MAINNET)
        network_choice="$1"
        ;;
    *)
        echo "Invalid network choice. Must be one of: LOCAL, TESTNET, MAINNET"
        exit 1
        ;;
esac

# Prefix for the variables
prefix="TVT_${network_choice}"

# Extract variables from JSON
operator_id=$(jq -r --arg prefix "$prefix" '.[$prefix + "_OPERATOR_ID"]' /app/config.json)
operator_key=$(jq -r --arg prefix "$prefix" '.[$prefix + "_OPERATOR_KEY"]' /app/config.json)
operator_key_type=$(jq -r --arg prefix "$prefix" '.[$prefix + "_OPERATOR_KEY_TYPE"]' /app/config.json)

# Output the variables in VAR: VAL format
echo "operator_id: $operator_id"
echo "operator_key: $operator_key"
echo "operator_key_type: $operator_key_type"