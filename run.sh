#!/bin/bash

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

output=$(sudo docker run --entrypoint /app/get-config.sh tvt $network_choice)

# Parse the output using grep and cut
operator_id=$(echo "$output" | grep '^operator_id:' | cut -d' ' -f2)
operator_key=$(echo "$output" | grep '^operator_key:' | cut -d' ' -f2)
operator_key_type=$(echo "$output" | grep '^operator_key_type:' | cut -d' ' -f2)

# Prompt user with defaults
read -p "Operator ID [$operator_id]: " user_operator_id
read -p "Operator Key [$operator_key]: " user_operator_key
read -p "Operator Key Type [$operator_key_type]: " user_operator_key_type

# Use defaults if user input is empty
operator_id="${user_operator_id:-$operator_id}"
operator_key="${user_operator_key:-$operator_key}"
operator_key_type="${user_operator_key_type:-$operator_key_type}"

read -p "Quantity: " quantity

case "$network_choice" in
  LOCAL) network_cfg="localnet" ;;
  MAINNET) network_cfg="mainnet" ;;
  TESTNET) network_cfg="testnet" ;;
  *) network_cfg="testnet" ;;  # Default to testnet if input is not recognized
esac

read -p "Do you want to add a scheduler? (y/n): " add_scheduler

if [[ "$add_scheduler" =~ ^[Yy]$ ]]; then
  echo "Enter the cron pattern (e.g., '0 * * * *'): "
  IFS= read -r cron_pattern

  # Prevent wildcard expansion by escaping `*`
  scheduler_arg="--scheduler=$cron_pattern"
  # Ask for stop-after argument
  read -p "Enter the stop-after duration (e.g., '2w', '3d', '5h', '30m'): " stop_after_duration

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

docker_command=("sudo" "docker" "run" "tvt" "--network=$network_cfg" "--quantity=$quantity" "--operator-id=$operator_id" "--operator-key=$operator_key" "--key-type=$user_operator_key_type")

# Append optional arguments if set
if [[ -n "$scheduler_arg" ]]; then
  docker_command+=("$scheduler_arg")
fi

if [[ -n "$stop_after_arg" ]]; then
  docker_command+=("$stop_after_arg")
fi

"${docker_command[@]}"
# sudo docker run tvt --network=$network_cfg --quantity=$quantity --operator-id=$operator_id --operator-key=$operator_key --key-type=$user_operator_key_type $scheduler_arg $stop_after_arg

