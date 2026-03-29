type LeafServerNode = {
  Id: string;
  ShowName: string;
  ShowNameV2: string;
  OriginalShowName: string;
  GeoName: string;
  IpList: string[];
  Flag: string;
  OriginalFlag: string;
  Level: number;
  IsVip: boolean;
  Description: string;
  AliasList?: string[];
};

type RegionSpec = {
  name: string;
  flag: string;
  cities: string[];
  providers: string[];
};

type LargeServerGroupFixture = {
  ServerGroup: {
    Id: string;
    ShowName: string;
    ShowNameV2: string;
    GeoName: string;
    ChildList: Array<{
      Id: string;
      ShowName: string;
      ShowNameV2: string;
      OriginalShowName: string;
      GeoName: string;
      Flag: string;
      OriginalFlag: string;
      Level: number;
      ChildList: LeafServerNode[];
    }>;
    Level: number;
  };
  GeoNameToIpListMap: Record<string, string[]>;
  SortShowNameList: string[];
};

const regions: RegionSpec[] = [
  {
    name: 'Americas',
    flag: 'US',
    cities: [
      'Atlanta',
      'Ashburn',
      'Chicago',
      'Dallas',
      'Denver',
      'Detroit',
      'Los Angeles',
      'Miami',
      'New York City',
      'Newark',
      'Phoenix',
      'San Francisco',
      'San Jose',
      'Seattle',
      'Toronto'
    ],
    providers: ['Linode', 'OVH', 'DigitalOcean', 'CloudVider', 'Inet']
  },
  {
    name: 'Europe',
    flag: 'EU',
    cities: [
      'Amsterdam',
      'Athens',
      'Brussels',
      'Copenhagen',
      'Dublin',
      'Frankfurt',
      'Helsinki',
      'London',
      'Madrid',
      'Milan',
      'Oslo',
      'Paris',
      'Prague',
      'Stockholm',
      'Warsaw'
    ],
    providers: ['ScaleWay', 'OVH', 'UpCloud', 'ZenLayer', 'Linode']
  },
  {
    name: 'Asia Pacific',
    flag: 'AP',
    cities: [
      'Bangkok',
      'Brisbane',
      'Hong Kong',
      'Jakarta',
      'Kuala Lumpur',
      'Melbourne',
      'Mumbai',
      'Osaka',
      'Seoul',
      'Singapore',
      'Sydney',
      'Taipei',
      'Tokyo',
      'Wellington',
      'Auckland'
    ],
    providers: ['LightNode', 'Aws', 'Vultr', 'ZenLayer', 'Linode']
  },
  {
    name: 'Middle East',
    flag: 'ME',
    cities: [
      'Abu Dhabi',
      'Bahrain',
      'Dubai',
      'Jeddah',
      'Kuwait City',
      'Muscat',
      'Qatar',
      'Riyadh',
      'Tehran',
      'Tel Aviv'
    ],
    providers: ['OracleCloud', 'M247', 'OneProvider', 'ZenLayer', 'LightNode']
  },
  {
    name: 'Africa',
    flag: 'AF',
    cities: [
      'Accra',
      'Addis Ababa',
      'Cairo',
      'Cape Town',
      'Casablanca',
      'Dar es Salaam',
      'Durban',
      'Johannesburg',
      'Lagos',
      'Nairobi',
      'Pretoria',
      'Tunis'
    ],
    providers: ['HostAfrica', 'OneProvider', 'Vultr', 'LightNode']
  },
  {
    name: 'Video & Game',
    flag: 'VG',
    cities: [
      'BbcIplayer',
      'Hotstar',
      'HotstarVip',
      'Hulu',
      'NetflixEs2',
      'NetflixJp',
      'NetflixUs2',
      'PUBG',
      'Roblox',
      'TvingKr'
    ],
    providers: ['SpecialStream', 'Game', 'Video', 'Vip']
  }
];

const makeIp = (seed: number, variant: number) => {
  const a = 10 + (seed % 200);
  const b = (seed * 3 + variant * 19) % 255;
  const c = (seed * 5 + variant * 29) % 255;
  const d = 10 + ((seed * 7 + variant * 13) % 240);
  return `${a}.${b}.${c}.${d}`;
};

const makeNodeId = (payload: Record<string, string | number | boolean>) => JSON.stringify(payload);

const makeLeafServerNode = (
  regionName: string,
  regionFlag: string,
  cityName: string,
  provider: string,
  providerIndex: number,
  cityIndex: number
): LeafServerNode => {
  const leafSeed = regionName.length * 97 + cityName.length * 31 + providerIndex * 11 + cityIndex;
  const showSuffix = providerIndex + 1;

  return {
    Id: makeNodeId({
      IsVip: true,
      Manufacturer: provider,
      GeoName: cityName
    }),
    ShowName: `${regionFlag}-${cityName}-${showSuffix}`,
    ShowNameV2: `${cityName}-${showSuffix}`,
    OriginalShowName: `${regionFlag}-${regionName}-${cityName}-${showSuffix}`,
    GeoName: cityName,
    IpList: [
      makeIp(leafSeed, 0),
      makeIp(leafSeed, 1),
      makeIp(leafSeed, 2)
    ],
    Flag: regionFlag,
    OriginalFlag: regionFlag,
    Level: 2 + (providerIndex % 2),
    IsVip: true,
    AliasList: providerIndex % 2 === 0 ? [regionName] : undefined,
    Description: [
      `Synthetic performance fixture for ${regionName}/${cityName}.`,
      `It keeps the object graph broad enough to exercise parseViewerInput and buildViewerPayloadState.`,
      `The repeated structure mirrors the large tree shape from the user's sample without relying on a live fixture host.`
    ].join(' ')
  };
};

const buildLargeServerGroupFixture = (): LargeServerGroupFixture => {
  const geoNameToIpListMap: Record<string, string[]> = {};
  const sortShowNameList: string[] = ['Free Servers', 'Support Server', 'The Fastest Server'];

  const regionNodes = regions.map((region, regionIndex) => {
    const regionLeafNodes = region.cities.flatMap((cityName, cityIndex) => {
      const leaves = region.providers.map((provider, providerIndex) => {
        const leaf = makeLeafServerNode(region.name, region.flag, cityName, provider, providerIndex, cityIndex);
        geoNameToIpListMap[`${region.name}:${cityName}:${provider}`] = leaf.IpList;
        sortShowNameList.push(leaf.ShowName, leaf.ShowNameV2);
        return leaf;
      });

      return leaves;
    });

    sortShowNameList.push(region.name);

    return {
      Id: makeNodeId({
        GeoName: region.name
      }),
      ShowName: region.name,
      ShowNameV2: region.name,
      OriginalShowName: region.name,
      GeoName: region.name,
      Flag: region.flag,
      OriginalFlag: region.flag,
      Level: 1 + (regionIndex % 2),
      ChildList: regionLeafNodes
    };
  });

  return {
    ServerGroup: {
      Id: makeNodeId({
        GeoName: 'ServerGroup'
      }),
      ShowName: 'ServerGroup',
      ShowNameV2: 'ServerGroup',
      GeoName: 'ServerGroup',
      ChildList: regionNodes,
      Level: 1
    },
    GeoNameToIpListMap: geoNameToIpListMap,
    SortShowNameList: sortShowNameList
  };
};

export const largeServerGroupFixture = buildLargeServerGroupFixture();
export const largeServerGroupJson = JSON.stringify(largeServerGroupFixture);
export const largeServerGroupSize = largeServerGroupJson.length;
