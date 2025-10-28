#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FRED Economic Indicators Data Fetcher (Last 10 Years, Dynamic)
从FRED获取从今天往前算10年的指定宏观经济指标数据。
"""

import os
import json
import sys
from datetime import datetime
import pandas as pd

# 尝试导入 fredapi，如果失败则给出提示
try:
    from fredapi import Fred
except ImportError:
    print("错误: fredapi 库未安装。请先运行: pip install fredapi")
    sys.exit(1)

# --- 路径和配置 ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(ROOT_DIR, 'data')
OUTPUT_FILE = os.path.join(DATA_DIR, 'economic_indicators.json')

# 确保data目录存在
os.makedirs(DATA_DIR, exist_ok=True)

# --- FRED 指标定义 ---
FRED_SERIES = {
    "CoreCPI": {
        "id": "CPILFESL",
        "name": "核心消费者物价指数 (年增长率)",
        "unit": "%"
    },
    "CorePCE": {
        "id": "PCEPILFE",
        "name": "核心个人消费支出物价指数 (年增长率)",
        "unit": "%"
    },
    "UnemploymentRate": {
        "id": "UNRATE",
        "name": "失业率",
        "unit": "%"
    },
    "ConsumerSentiment": {
        "id": "UMCSENT",
        "name": "密歇根大学消费者信心指数",
        "unit": "指数"
    }
}


def fetch_data_from_fred(fred_client, series_id, start_date):
    """
    从FRED获取单个序列的数据，并格式化为前端可用的格式。
    """
    try:
        print(f"  -> 正在获取 {series_id} (从 {start_date} 开始)...")
        series = fred_client.get_series(series_id, observation_start=start_date)
        series = series.dropna()
        data_list = [
            [int(ts.timestamp() * 1000), round(val, 2)]
            for ts, val in series.items()
        ]
        return data_list
    except Exception as e:
        print(f"  -> 获取 {series_id} 失败: {e}")
        return None


def main():
    """主执行函数"""
    print("=" * 60)
    print("开始获取最近10年的宏观经济数据 (from FRED)")
    print("=" * 60)

    # 1. 设置API密钥
    api_key = "70e364d8d04d3be1d82867924cd45d58"
    if api_key == "YOUR_API_KEY_HERE":
        print("错误: 请在脚本中填入您的FRED API密钥。")
        sys.exit(1)

    fred = Fred(api_key=api_key)

    # 动态计算起始日期
    today = datetime.now()
    # 获取10年数据，需要从10年前的日期开始
    start_date_10y_dt = today - pd.DateOffset(years=10)
    # 为了计算年增长率，我们需要额外一年的数据作为基础，所以从11年前开始
    start_date_for_yoy_calc_dt = today - pd.DateOffset(years=11)

    start_date_10y = start_date_10y_dt.strftime('%Y-%m-%d')
    start_date_for_yoy_calc = start_date_for_yoy_calc_dt.strftime('%Y-%m-%d')

    print(f"当前日期: {today.strftime('%Y-%m-%d')}")
    print(f"动态计算数据起始日期 (10年): {start_date_10y}")
    print(f"动态计算同比增长所需数据起始日期 (11年): {start_date_for_yoy_calc}\n")

    # 2. 循环获取所有指标
    all_indicators_data = {}
    for key, details in FRED_SERIES.items():
        data = None
        # 对于年增长率指标，我们需要从FRED获取月度数据然后自己计算
        if "年增长率" in details["name"]:
            try:
                print(f"  -> 正在获取并计算 {details['id']} 的10年年增长率...")
                # 获取过去11年的月度数据，以确保能计算第1年的同比增长
                monthly_data = fred.get_series(details['id'], observation_start=start_date_for_yoy_calc)
                yearly_change = monthly_data.pct_change(periods=12) * 100

                # 筛选出最近10年的数据
                series = yearly_change[yearly_change.index >= start_date_10y].dropna()

                data = [
                    [int(ts.timestamp() * 1000), round(val, 2)]
                    for ts, val in series.items()
                ]
            except Exception as e:
                print(f"  -> 计算 {details['id']} 年增长率失败: {e}")
                data = None
        else:
            # 对于其他指标，直接从10年前开始获取
            data = fetch_data_from_fred(fred, details["id"], start_date=start_date_10y)

        if data:
            all_indicators_data[key] = {
                "name": details["name"],
                "unit": details["unit"],
                "data": data
            }
            print(f"  ✓ 成功获取 {key} ({len(data)} 条记录)")
        else:
            print(f"  ✗ 获取 {key} 失败")

    # 3. 准备最终的JSON输出
    output_json = {
        "updateTimestamp": datetime.utcnow().isoformat() + "Z",
        "indicators": all_indicators_data
    }

    # 4. 保存到文件
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(output_json, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 成功: 所有经济数据已保存到: {OUTPUT_FILE}")
    except Exception as e:
        print(f"\n✗ 错误: 保存JSON文件失败: {e}")

    print("\n" + "=" * 60)
    print("任务完成!")
    print("=" * 60)


if __name__ == "__main__":
    main()
