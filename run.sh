#!/bin/bash

mkdir -p work
mkdir -p /app/work/pid

CONFIG_FILE="config.json"

# Prompt user for network
read -p "Select network [LOCAL/TESTNET/MAINNET] (default: TESTNET): " network_choice
network_choice=${network_choice:-TESTNET}
network_choice=$(echo "$network_choice" | tr '[:lower:]' '[:upper:]')

# Validate network
case "$network_choice" in
    LOCAL|TESTNET|MAINNET)
        echo "Network selected: $network_choice"
        ;;
    *)
        echo "Invalid network: $network_choice"
        exit 1
        ;;
esac

SCRIPT_DIR="$(dirname "$(realpath "$0")")"
# Create config.json file with empty JSON object if it does not exist
if [ ! -f "$SCRIPT_DIR/work/config.json" ]; then
    echo "{}" > $SCRIPT_DIR/work/config.json
    echo "config.json file created with empty JSON object."
fi

output=$(./get-config.sh $network_choice)

# Parse the output using grep and cut
operator_id=$(echo "$output" | grep '^operator_id:' | cut -d' ' -f2)
operator_key=$(echo "$output" | grep '^operator_key:' | cut -d' ' -f2)
operator_key_type=$(echo "$output" | grep '^operator_key_type:' | cut -d' ' -f2)

operator_key_type="${operator_key_type:-ECDSA}"

# Prompt user with defaults
read -p "Operator ID [$operator_id]: " user_operator_id
read -p "Operator Key [$operator_key]: " user_operator_key
read -p "Operator Key Type [${operator_key_type:-ECDSA}]: " user_operator_key_type

# Use defaults if user input is empty
operator_id="${user_operator_id:-$operator_id}"
operator_key="${user_operator_key:-$operator_key}"
operator_key_type="${user_operator_key_type:-$operator_key_type}"

if [[ "$operator_key_type" != "ECDSA" && "$operator_key_type" != "ED25519" ]]; then
  echo "Error: Invalid operator key type. Must be 'ECDSA' or 'ED25519'."
  exit 1
fi


read -p "Quantity [5]: " quantity
quantity=${quantity:-5}

case "$network_choice" in
  LOCAL) network_cfg="localnet" ;;
  MAINNET) network_cfg="mainnet" ;;
  TESTNET) network_cfg="testnet" ;;
  *) network_cfg="testnet" ;;  # Default to testnet if input is not recognized
esac

read -p "Do you want to add a scheduler? (y/n): " add_scheduler

if [[ "$add_scheduler" =~ ^[Yy]$ ]]; then
options=("Hourly" "Every half hour" "Every quarter" "Custom pattern")
function show_menu() {
  echo "How often do you want to run it?"
  PS3="Enter your choice (1-5): "
  select choice in "${options[@]}"; do
    case $REPLY in
      1)
        frequency=1
        break
        ;;
      2)
        frequency="30m"
        break
        ;;
      3)
        frequency="15m"
        break
        ;;
      4)
        echo "Enter the cron pattern (e.g., '0 * * * *'): (default)[*/15 * * * * *]"
        IFS= read -r cron_pattern
        cron_pattern=${cron_pattern:-"*/15 * * * * *"}
        break
        ;;
      *)
        echo "Invalid option. Please try again."
        ;;
    esac
  done
}

show_menu

if [[ -n "$frequency" ]]; then
  scheduler_arg="--scheduler-timeout=$frequency"
fi

if [[ -n "$cron_pattern" ]]; then
  scheduler_arg="--scheduler=$cron_pattern"
fi

  echo "For how long you want the schedule to be active?"
  PS3="Enter your choice (1-4): "
  options_duration=("1 hour", "3 hours", "1 day", "I want to provide interval string")
  select choice in "${options_duration[@]}"; do
    case $REPLY in
      1)
        stop_after_duration="1h"
        break
        ;;
      2)
        stop_after_duration="3h"
        break
        ;;
      3)
        stop_after_duration="1d"
        break
        ;;
      4)
        read -p "Enter the stop-after duration (e.g., '2w', '3d', '5h', '30m'): " stop_after_duration
        echo "Enter the cron pattern (e.g., '0 * * * *'): (default)[*/15 * * * * *]"
        break
        ;;
      *)
        echo "Invalid option. Please try again."
        ;;
    esac
  done


  # Validate stop-after duration
  if [[ "$stop_after_duration" =~ ^[0-9]+[mhdw]$ ]]; then
    echo "Stop-after duration set to: $stop_after_duration"
    stop_after_arg="--stop-after=$stop_after_duration"
  else
    echo "Invalid stop-after duration. Not set."
  fi

else
  echo "Scheduler not added."
fi

run_command=("pnpm" "start" "--network=$network_cfg" "--quantity=$quantity" "--operator-id=$operator_id" "--operator-key=$operator_key" "--key-type=$operator_key_type")

# Append optional arguments if set
if [[ -n "$scheduler_arg" ]]; then
  run_command+=("$scheduler_arg")
fi

if [[ -n "$stop_after_arg" ]]; then
  run_command+=("$stop_after_arg")
fi

"${run_command[@]}"

