#ifndef __GAME_CONFIG_H__
#define __GAME_CONFIG_H__

#include "libjson/json/value.h"

namespace datamine {

class GameConfig {
public:
  GameConfig();

  GameConfig(Json::Value client_game_config,
             Json::Value client_game_config_version,
             Json::Value full_config,
             Json::Value full_config_hash)
      : client_game_config_(std::move(client_game_config)),
        client_game_config_version_(std::move(client_game_config_version)),
        full_config_(std::move(full_config)), full_config_hash_(std::move(full_config_hash)) {}

  Json::Value client_game_config() const { return client_game_config_; }
  Json::Value client_game_config_version() const { return client_game_config_; }
  Json::Value full_config() const { return full_config_; }
  Json::Value full_config_hash() const { return full_config_; }

private:
  Json::Value client_game_config_;
  Json::Value client_game_config_version_;
  Json::Value full_config_;
  Json::Value full_config_hash_;
};

} // namespace datamine

#endif // __GAME_CONFIG_H__