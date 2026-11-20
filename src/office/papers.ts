/**
 * Siddharth's peer-reviewed papers. Public bibliographic metadata, copied from
 * Crossref (journal paper) and Semantic Scholar (conference paper, whose
 * abstract Crossref does not carry). Both papers are closed access, so the
 * abstract is the deepest source the paper agents have — their prompt says so.
 */

export interface Paper {
  id: string
  title: string
  authors: string[]
  venue: string
  kind: 'journal' | 'conference'
  published: string
  citation: string
  doi: string
  url: string
  abstract: string
  /** How this paper relates to the other one, in plain words. */
  relation: string
}

export const PAPERS: Paper[] = [
  {
    id: 'jikm-2024',
    title:
      'Untapped Location Discovery on Social Media by Combining Geospatial Clustering with Natural Language Processing',
    authors: ['Siddharth Mehta', 'Gautam Jain', 'Shuchi Mala'],
    venue: 'Journal of Information & Knowledge Management (World Scientific)',
    kind: 'journal',
    published: '2024-01-03',
    citation: 'J. Info. Know. Mgmt. 23(03), 2024',
    doi: '10.1142/S0219649224500254',
    url: 'https://doi.org/10.1142/S0219649224500254',
    abstract:
      'This methodology combines geospatial clustering and Natural Language Processing (NLP) to create a framework for discovering unexplored geotags in social media. The framework contains the collection of data from social media platforms, the preprocessing of data with Pandas, Natural Language Toolkit (NLTK) and SpaCy libraries for the NLP analysis as well as for sentiment analysis and named entity recognition, followed by spatial clustering with Density-based Space Clustering of Noise Applications (DBSCAN), K-Means and HDBSCAN algorithms, then visualising with Matplotlib and Folium libraries. The data analysis and statistics were done using Pandas and NumPy libraries, and exploration through the selection and collection of more data based on the previous step. In addition, a prediction model has been developed to predict a location cluster using its name by comparing it to the preprocessed comma-separated values data file. Currently, there are certain locations like small-scale hospitals or unknown tourist places which are not currently tagged on available maps applications. This framework can be useful for researchers and policy makers to identify those locations and gain insights from social media data and find its potential for decision-making in various fields.',
    relation:
      'The extended journal version of the 2023 Confluence conference paper: same authors and problem, with the full pipeline (NER, sentiment, DBSCAN / K-Means / HDBSCAN comparison, cluster prediction model).',
  },
  {
    id: 'confluence-2023',
    title:
      'Natural Language Processing Approach and Geospatial Clustering to Explore the Unexplored Geotags Using Media',
    authors: ['Siddharth Mehta', 'Gautam Jain', 'Shuchi Mala'],
    venue:
      '2023 13th International Conference on Cloud Computing, Data Science & Engineering (Confluence), Noida, India (IEEE)',
    kind: 'conference',
    published: '2023-01-19',
    citation: 'Confluence 2023, pp. 672–675',
    doi: '10.1109/CONFLUENCE56041.2023.10048848',
    url: 'https://doi.org/10.1109/CONFLUENCE56041.2023.10048848',
    abstract:
      'Natural Language Processing (NLP) is a growing field of unstructured data analysis and computational methodology that uses text from a variety of sources. Typically, natural language processing is used to extract meaning from a large array of corpora in an automated way, often using statistical or artificial intelligence methods when data is obtained through web clippings or document searches. Geospatial Analysis is a field under Data Science which deal with the processing of satellite images, GPS (Global positioning System) coordinates, to build geographic models. There are certain locations which are not exactly geotagged but they can be described through some referenced geotagged location (e.g. "200 meters west of Qutub Minar"). Geospatial clustering is the method of grouping a set of spatial objects into groups called "clusters". Objects within a cluster show a high degree of similarity, whereas the clusters are as much dissimilar as possible. The goal of clustering is to do a generalization and to reveal a relation between spatial and non-spatial attributes. The Aeronautical Reconnaissance Coverage Geographic Information System (ArcGIS) toolkit is ideal for this, and in particular the Arcgis.learn Application Programming Interface (API) provides methods for extracting features with output that can be written directly to a spatial DataFrame or feature class. Understanding Spatial Structure Use the structure and layout information in PDF (Portable Document Format) files to improve the performance of custom object retrieval. In this project we will be exploring the places or toponyms which are not geotagged and have very less description about them and try to explore these places using geotagged places from the media articles like, blogs, websites, etc.',
    relation:
      'The first, shorter conference paper (4 pages). It framed the problem — places with no geotag that media describe relative to known landmarks — and the 2024 journal paper extended it into a full framework.',
  },
]

export const PAPER_IDS = PAPERS.map((p) => p.id) as [string, ...string[]]

export function paperById(id: string | undefined): Paper | undefined {
  return PAPERS.find((p) => p.id === id)
}
